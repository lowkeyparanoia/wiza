import { ConvexError } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireIdentity, requireOwnership } from "./lib/auth";
import { callVision } from "./lib/ai";

// ─── Helper: strip markdown fences from Gemini JSON responses ─

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

// ─── Helper: URL to base64 ───────────────────────────────────

async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image from ${url}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// ─── Queries ──────────────────────────────────────────────────

/** Get all documents for an application, optionally filtered by type. */
export const listByApplication = query({
  args: {
    applicationId: v.id("applications"),
    type: v.optional(
      v.union(
        v.literal("salary_slip"),
        v.literal("leave_letter"),
        v.literal("bank_statement"),
        v.literal("sponsor_letter"),
        v.literal("invitation_letter"),
        v.literal("itr")
      )
    ),
  },
  handler: async (ctx, { applicationId, type }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const app = await ctx.db.get(applicationId);
    if (!app || app.createdBy !== identity.tokenIdentifier) return [];

    const q = ctx.db
      .query("documents")
      .withIndex("by_application", b => b.eq("applicationId", applicationId));

    const docs = await q.collect();
    if (type) return docs.filter(d => d.type === type);
    return docs;
  },
});

/** Get download URL for a document. */
export const getUrl = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const doc = await ctx.db.get(documentId);
    if (!doc || doc.createdBy !== identity.tokenIdentifier) return null;

    return await ctx.storage.getUrl(doc.storageId);
  },
});

// ─── Internal query: fetch document for actions ───────────────

/** Used by OCR actions — actions can't use ctx.db directly. */
export const getDocumentForAction = internalQuery({
  args: { documentId: v.id("documents"), tokenIdentifier: v.string() },
  handler: async (ctx, { documentId, tokenIdentifier }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.createdBy !== tokenIdentifier) return null;
    return doc;
  },
});

// ─── Upload URL ───────────────────────────────────────────────

export const generateUploadUrl = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── OCR: Salary Slip extraction ─────────────────────────────

/**
 * Extract company name, designation, and address from an uploaded salary slip.
 * Called after upload; stores result in document.extractedData.
 */
export const extractSalarySlipData = action({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });

    const doc = await ctx.runQuery(internal.documents.getDocumentForAction, {
      documentId,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!doc) throw new ConvexError({ code: "FORBIDDEN" });

    const url = await ctx.storage.getUrl(doc.storageId);
    if (!url) throw new ConvexError({ code: "STORAGE_ERROR" });

    const imageBase64 = await urlToBase64(url);
    const mimeType = doc.mimeType || "image/jpeg";

    const text = await callVision(
      [{ base64: imageBase64, mimeType }],
      `Extract these fields from this salary slip image. Return ONLY valid JSON:
{
  "companyName": "...",
  "designation": "...",
  "companyAddress": "...",
  "employeeName": "...",
  "month": "YYYY-MM"
}
If a field is not visible, use null.`,
      512
    );
    const extracted = JSON.parse(stripJsonFences(text)) as Record<string, string | null>;

    await ctx.runMutation(internal.documents.saveExtractedData, {
      documentId,
      extractedData: extracted,
    });

    return extracted;
  },
});

// ─── OCR: Leave letter / NOC verification ────────────────────

/** Verify traveller name and seal/signature on a leave letter or NOC. */
export const verifyLeaveLetterDoc = action({
  args: {
    documentId: v.id("documents"),
    expectedName: v.string(),
  },
  handler: async (ctx, { documentId, expectedName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });

    const doc = await ctx.runQuery(internal.documents.getDocumentForAction, {
      documentId,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!doc) throw new ConvexError({ code: "FORBIDDEN" });

    const url = await ctx.storage.getUrl(doc.storageId);
    if (!url) throw new ConvexError({ code: "STORAGE_ERROR" });

    const imageBase64 = await urlToBase64(url);
    const mimeType = doc.mimeType || "image/jpeg";

    const text = await callVision(
      [{ base64: imageBase64, mimeType }],
      `Analyze this leave sanction letter / NOC document. Return ONLY valid JSON:
{
  "nameFound": "<full name found in document or null>",
  "nameMatches": <true/false — does name match "${expectedName}"?>,
  "hasSeal": <true/false — company seal visible?>,
  "hasSignature": <true/false — authorized signature present?>,
  "companyName": "<company name or null>",
  "documentType": "leave_letter" | "noc" | "appointment_letter" | "unknown"
}`,
      512
    );
    const extracted = JSON.parse(stripJsonFences(text)) as Record<string, unknown>;

    await ctx.runMutation(internal.documents.saveExtractedData, {
      documentId,
      extractedData: extracted,
    });

    return extracted;
  },
});

// ─── OCR: Bank statement verification ────────────────────────

/**
 * Extract traveler name, date range, and closing balance from a bank statement.
 * Stores result in document.extractedData.
 */
export const verifyBankStatement = action({
  args: {
    documentId: v.id("documents"),
    expectedName: v.string(),
  },
  handler: async (ctx, { documentId, expectedName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });

    const doc = await ctx.runQuery(internal.documents.getDocumentForAction, {
      documentId,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!doc) throw new ConvexError({ code: "FORBIDDEN" });

    const url = await ctx.storage.getUrl(doc.storageId);
    if (!url) throw new ConvexError({ code: "STORAGE_ERROR" });

    const imageBase64 = await urlToBase64(url);
    const mimeType = doc.mimeType || "image/jpeg";

    const text = await callVision(
      [{ base64: imageBase64, mimeType }],
      `Analyze this bank statement. Return ONLY valid JSON:
{
  "accountHolderName": "<name on the account or null>",
  "nameMatches": <true/false — does name match "${expectedName}"?>,
  "statementStartDate": "<earliest date in statement as YYYY-MM or null>",
  "statementEndDate": "<latest date in statement as YYYY-MM or null>",
  "coversLast6Months": <true/false — does the statement cover the last 6 months?>,
  "closingBalance": <closing balance as a number or null>,
  "closingBalanceCurrency": "<currency code e.g. INR, USD or null>",
  "meetsMinBalance": <true/false — is closing balance >= 150000 INR or equivalent?>
}
If a field is not visible, use null.`,
      512
    );
    const extracted = JSON.parse(stripJsonFences(text)) as Record<string, unknown>;

    await ctx.runMutation(internal.documents.saveExtractedData, {
      documentId,
      extractedData: extracted,
    });

    return extracted;
  },
});

// ─── Mutations ────────────────────────────────────────────────

/** Save uploaded document metadata after client upload completes. */
export const save = mutation({
  args: {
    applicationId: v.id("applications"),
    type: v.union(
      v.literal("salary_slip"),
      v.literal("leave_letter"),
      v.literal("company_appointment_letter"),
      v.literal("bank_statement"),
      v.literal("sponsor_letter"),
      v.literal("invitation_letter"),
      v.literal("itr")
    ),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    mimeType: v.string(),
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    // Salary slips: max 3, one per month slot (month-1, month-2, month-3)
    if (args.type === "salary_slip") {
      const existing = await ctx.db
        .query("documents")
        .withIndex("by_application_and_type", q =>
          q.eq("applicationId", args.applicationId).eq("type", "salary_slip")
        )
        .collect();

      if (existing.length >= 3) {
        throw new ConvexError({
          code: "LIMIT_EXCEEDED",
          message: "Maximum 3 salary slips allowed",
        });
      }

      // Ensure no duplicate month slot
      if (args.month && existing.some(d => d.month === args.month)) {
        throw new ConvexError({
          code: "DUPLICATE",
          message: `Salary slip for ${args.month} already uploaded`,
        });
      }
    }

    // Bank statements: max 6
    if (args.type === "bank_statement") {
      const existing = await ctx.db
        .query("documents")
        .withIndex("by_application_and_type", q =>
          q.eq("applicationId", args.applicationId).eq("type", "bank_statement")
        )
        .collect();

      if (existing.length >= 6) {
        throw new ConvexError({
          code: "LIMIT_EXCEEDED",
          message: "Maximum 6 bank statements allowed",
        });
      }
    }

    return await ctx.db.insert("documents", {
      applicationId: args.applicationId,
      createdBy: identity.tokenIdentifier,
      type: args.type,
      storageId: args.storageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      month: args.month,
      uploadedAt: Date.now(),
    });
  },
});

// ─── Internal: save extracted OCR data ───────────────────────

export const saveExtractedData = internalMutation({
  args: {
    documentId: v.id("documents"),
    extractedData: v.any(),
  },
  handler: async (ctx, { documentId, extractedData }) => {
    await ctx.db.patch(documentId, { extractedData });
  },
});

/** Update extracted salary slip fields (after user edits). */
export const updateExtractedData = mutation({
  args: {
    documentId: v.id("documents"),
    extractedData: v.any(),
  },
  handler: async (ctx, { documentId, extractedData }) => {
    const identity = await requireIdentity(ctx);
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new ConvexError({ code: "NOT_FOUND" });
    requireOwnership(doc.createdBy, identity.tokenIdentifier, "document");
    await ctx.db.patch(documentId, { extractedData });
  },
});

/** Delete a document (before submission only). */
export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const identity = await requireIdentity(ctx);
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new ConvexError({ code: "NOT_FOUND" });
    requireOwnership(doc.createdBy, identity.tokenIdentifier, "document");

    // Also delete from storage
    await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(documentId);
  },
});
