import { ConvexError } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal, api } from "./_generated/api";
import { requireIdentity, requireOwnership } from "./lib/auth";
import { callText, callVision } from "./lib/ai";

// ─── Queries ──────────────────────────────────────────────────

/** Get the current cover letter for an application. */
export const getByApplication = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const app = await ctx.db.get(applicationId);
    if (!app || app.createdBy !== identity.tokenIdentifier) return null;

    return await ctx.db
      .query("coverLetters")
      .withIndex("by_application", q => q.eq("applicationId", applicationId))
      .order("desc")
      .first();
  },
});

/** Get download URL for company logo. */
export const getLogoUrl = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const app = await ctx.db.get(applicationId);
    if (!app || app.createdBy !== identity.tokenIdentifier) return null;

    const letter = await ctx.db
      .query("coverLetters")
      .withIndex("by_application", q => q.eq("applicationId", applicationId))
      .order("desc")
      .first();

    if (!letter?.logoStorageId) return null;
    return await ctx.storage.getUrl(letter.logoStorageId);
  },
});

// ─── Upload URL ───────────────────────────────────────────────

/** Generate Convex upload URL for self-employed company logo. */
export const generateLogoUploadUrl = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── Internal query: fetch data needed for generation ────────

/** Actions can't use ctx.db — this internal query bridges the gap. */
export const getDataForGenerate = internalQuery({
  args: { applicationId: v.id("applications"), tokenIdentifier: v.string() },
  handler: async (ctx, { applicationId, tokenIdentifier }) => {
    const app = await ctx.db.get(applicationId);
    if (!app || app.createdBy !== tokenIdentifier) return null;

    let applicantName = "Applicant";
    let nationality: string | null = null;
    let passportExpiry: string | null = null;

    if (app.passportDataId) {
      const passport = await ctx.db.get(app.passportDataId);
      if (passport) {
        applicantName = `${passport.givenNames} ${passport.surname}`.trim();
        nationality = passport.nationality ?? null;
        passportExpiry = passport.expiryDate ?? null;
      }
    }

    // Pull OCR data from uploaded documents
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_application", q => q.eq("applicationId", applicationId))
      .collect();

    const salarySlip = docs.find(d => d.type === "salary_slip" && d.extractedData);
    const bankStatement = docs.find(d => d.type === "bank_statement" && d.extractedData);
    const leaveLetter = docs.find(d => d.type === "leave_letter" && d.extractedData);
    const sponsorDoc = docs.find(d => d.type === "sponsor_letter" && d.extractedData);
    const invitationDoc = docs.find(d => d.type === "invitation_letter" && d.extractedData);

    const existing = await ctx.db
      .query("coverLetters")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .order("desc")
      .first();

    return {
      occupationType: app.occupationType ?? "salaried",
      destination: app.destination ?? "Schengen",
      visaType: app.visaType ?? undefined,
      travelDateFrom: app.travelDateFrom ?? undefined,
      travelDateTo: app.travelDateTo ?? undefined,
      applicantName,
      nationality,
      passportExpiry,
      existingVersion: existing?.version ?? 0,
      ocrData: {
        salarySlip: salarySlip?.extractedData as Record<string, unknown> | undefined,
        bankStatement: bankStatement?.extractedData as Record<string, unknown> | undefined,
        leaveLetter: leaveLetter?.extractedData as Record<string, unknown> | undefined,
        sponsorDoc: sponsorDoc?.extractedData as Record<string, unknown> | undefined,
        invitationDoc: invitationDoc?.extractedData as Record<string, unknown> | undefined,
      },
    };
  },
});

// ─── AI Generation ────────────────────────────────────────────

/**
 * Generate a cover letter using Claude AI.
 * Runs as an action so it can call the Anthropic API.
 */
export const generate = action({
  args: {
    applicationId: v.id("applications"),
    additionalStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, { applicationId, additionalStorageIds }): Promise<Id<"coverLetters">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });

    const data = await ctx.runQuery(internal.coverLetters.getDataForGenerate, {
      applicationId,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!data) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });

    const { occupationType: occupation, destination, visaType, travelDateFrom, travelDateTo, applicantName, existingVersion } = data;

    // Extract text from additional files (resume, etc.) if provided
    let additionalContext: string | undefined;
    if (additionalStorageIds && additionalStorageIds.length > 0) {
      const texts: string[] = [];
      for (const storageId of additionalStorageIds) {
        const url = await ctx.storage.getUrl(storageId);
        if (url) {
          const extracted = await extractTextFromFile(url, "");
          if (extracted) texts.push(extracted);
        }
      }
      if (texts.length > 0) additionalContext = texts.join("\n\n---\n\n");
    }

    const content = await callDeepSeekForCoverLetter({
      applicantName,
      occupation,
      destination,
      visaType: visaType ?? undefined,
      nationality: data.nationality ?? undefined,
      passportExpiry: data.passportExpiry ?? undefined,
      ocrData: data.ocrData,
      travelDateFrom,
      travelDateTo,
      additionalContext,
    });

    const coverLetterId = await ctx.runMutation(internal.coverLetters.saveGenerated, {
      applicationId,
      tokenIdentifier: identity.tokenIdentifier,
      content,
      applicantName,
      occupation,
      destination,
      version: existingVersion + 1,
    });

    await ctx.runMutation(api.applications.linkCoverLetter, {
      applicationId,
      coverLetterId,
    });

    return coverLetterId;
  },
});

// ─── Internal mutation: save generated letter ─────────────────

export const saveGenerated = internalMutation({
  args: {
    applicationId: v.id("applications"),
    tokenIdentifier: v.string(),
    content: v.string(),
    applicantName: v.string(),
    occupation: v.string(),
    destination: v.optional(v.string()),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND" });
    requireOwnership(app.createdBy, args.tokenIdentifier, "application");

    const now = Date.now();
    return await ctx.db.insert("coverLetters", {
      applicationId: args.applicationId,
      createdBy: args.tokenIdentifier,
      content: args.content,
      template: "standard_v1",
      applicantName: args.applicantName,
      occupation: args.occupation,
      destination: args.destination,
      version: args.version,
      approved: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── Mutations ────────────────────────────────────────────────

/** Approve the current cover letter version. */
export const approve = mutation({
  args: { coverLetterId: v.id("coverLetters") },
  handler: async (ctx, { coverLetterId }) => {
    const identity = await requireIdentity(ctx);
    const letter = await ctx.db.get(coverLetterId);
    if (!letter) throw new ConvexError({ code: "NOT_FOUND" });
    requireOwnership(letter.createdBy, identity.tokenIdentifier, "cover letter");

    await ctx.db.patch(coverLetterId, {
      approved: true,
      updatedAt: Date.now(),
    });
  },
});

/** Save company logo storage ID for self-employed variant. */
export const saveLogo = mutation({
  args: {
    applicationId: v.id("applications"),
    logoStorageId: v.id("_storage"),
  },
  handler: async (ctx, { applicationId, logoStorageId }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    const now = Date.now();

    // Upsert: patch existing or create placeholder
    const existing = await ctx.db
      .query("coverLetters")
      .withIndex("by_application", q => q.eq("applicationId", applicationId))
      .order("desc")
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { logoStorageId, updatedAt: now });
      return existing._id;
    }

    // Create a shell cover letter record for self-employed (content generated later)
    let applicantName = "Applicant";
    if (app.passportDataId) {
      const passport = await ctx.db.get(app.passportDataId);
      if (passport) {
        applicantName = `${passport.givenNames} ${passport.surname}`.trim();
      }
    }

    const coverId = await ctx.db.insert("coverLetters", {
      applicationId,
      createdBy: identity.tokenIdentifier,
      content: "",
      template: "self_employed_v1",
      applicantName,
      occupation: "self_employed",
      destination: app.destination,
      logoStorageId,
      version: 1,
      approved: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(applicationId, {
      coverLetterId: coverId,
      status: "cover_letter_generated",
      updatedAt: now,
    });

    return coverId;
  },
});

// ─── AI helper ────────────────────────────────────────────────

async function extractTextFromFile(url: string, _unused: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
    const base64 = btoa(binary);
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0]?.trim() ?? "image/jpeg";
    return await callVision([{ base64, mimeType }], "Extract all text content from this document. Return plain text only.", 2048);
  } catch {
    return "";
  }
}

async function callDeepSeekForCoverLetter({
  applicantName,
  occupation,
  destination,
  visaType,
  nationality,
  passportExpiry,
  ocrData,
  travelDateFrom,
  travelDateTo,
  additionalContext,
}: {
  applicantName: string;
  occupation: string;
  destination: string;
  visaType?: string;
  nationality?: string;
  passportExpiry?: string;
  ocrData?: {
    salarySlip?: Record<string, unknown>;
    bankStatement?: Record<string, unknown>;
    leaveLetter?: Record<string, unknown>;
    sponsorDoc?: Record<string, unknown>;
    invitationDoc?: Record<string, unknown>;
  };
  travelDateFrom?: string;
  travelDateTo?: string;
  additionalContext?: string;
}): Promise<string> {
  // Build facts block from real OCR data — only include fields that exist
  const facts: string[] = [];

  facts.push(`Full name: ${applicantName}`);
  if (nationality) facts.push(`Nationality: ${nationality}`);
  if (visaType) facts.push(`Visa type: ${visaType}`);
  if (passportExpiry) facts.push(`Passport valid until: ${passportExpiry}`);
  if (travelDateFrom && travelDateTo) {
    facts.push(`Intended travel dates: ${travelDateFrom} to ${travelDateTo}`);
  } else if (travelDateFrom) {
    facts.push(`Intended departure: ${travelDateFrom}`);
  }

  const sl = ocrData?.salarySlip;
  if (sl) {
    if (sl.companyName) facts.push(`Employer: ${sl.companyName}`);
    if (sl.designation) facts.push(`Job title: ${sl.designation}`);
    if (sl.companyAddress) facts.push(`Company address: ${sl.companyAddress}`);
  }

  const bs = ocrData?.bankStatement;
  if (bs) {
    if (bs.closingBalance && bs.closingBalanceCurrency)
      facts.push(`Bank closing balance: ${bs.closingBalance} ${bs.closingBalanceCurrency}`);
    if (bs.coversLast6Months) facts.push(`Bank statement covers last 6 months: yes`);
  }

  const ll = ocrData?.leaveLetter;
  if (ll) {
    if (ll.companyName) facts.push(`Leave sanction from: ${ll.companyName}`);
    if (ll.nameMatches) facts.push(`Name verified on leave letter: yes`);
  }

  const sp = ocrData?.sponsorDoc;
  if (sp && sp.companyName) facts.push(`Sponsor: ${sp.companyName}`);

  const inv = ocrData?.invitationDoc;
  if (inv && inv.hostName) facts.push(`Invited by: ${inv.hostName}`);

  const factsBlock = facts.length > 0
    ? `\n\nVERIFIED APPLICANT FACTS (extracted from uploaded documents — use these exactly, do not invent alternatives):\n${facts.map(f => `- ${f}`).join("\n")}`
    : "";

  const extraContext = additionalContext
    ? `\n\nSUPPLEMENTARY DOCUMENTS (resume / additional files — extract relevant details):\n"""\n${additionalContext}\n"""`
    : "";

  const occupationLabel =
    occupation === "self_employed" ? "self-employed"
    : occupation === "student" ? "student"
    : occupation === "retired" ? "retired"
    : occupation === "homemaker" ? "homemaker"
    : "salaried employee";

  const prompt = `Write a visa cover letter. The applicant is a ${occupationLabel} applying for a ${destination} visa.
${factsBlock}${extraContext}

RULES (hard constraints):
1. Only use facts listed above — never invent details.
2. No bracket placeholders like [Name] or [Company] — if something is unknown, skip that sentence.
3. Use travel dates exactly as given. If none, say "my planned visit".
4. First person, signed as ${applicantName}.
5. Sound like a real person wrote this — natural, slightly personal tone. Vary sentence length. Avoid robotic transitions like "Furthermore" or "In addition". Don't start every sentence with "I". Use occasional contractions (I'm, I've, I'd).
6. Still professional — this is for a government visa officer. No slang.
7. 4 paragraphs (no headers, no bullet points):
   - Why visiting ${destination}, when, what you plan to do
   - Money situation — employer, salary or savings if known; otherwise personal funds
   - Life back home — job, family, home — why you're coming back
   - Closing — happy to provide more docs or attend interview
8. End with: "Yours sincerely,\n${applicantName}"
9. Plain text only — no markdown, no JSON.`;

  return await callText(prompt, 1024, 0.7);
}
