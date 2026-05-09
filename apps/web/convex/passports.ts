import { ConvexError } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal, api } from "./_generated/api";
import { requireIdentity, requireOwnership } from "./lib/auth";
import { callVision } from "./lib/ai";

// ─── Public query ─────────────────────────────────────────────

export const get = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const app = await ctx.db.get(applicationId);
    if (!app || app.createdBy !== identity.tokenIdentifier) return null;

    return await ctx.db
      .query("passportData")
      .withIndex("by_application", q => q.eq("applicationId", applicationId))
      .unique();
  },
});

// ─── Upload URL generation ────────────────────────────────────

/** Generate Convex upload URL for passport page images. */
export const generateUploadUrl = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Must be signed in" });
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── OCR action (calls external Vision API) ──────────────────

/**
 * Extract passport MRZ from uploaded images.
 * Calls Claude Vision / Google Vision API.
 * Runs as internalAction to prevent direct client calls.
 */
export const extractAndVerify = action({
  args: {
    applicationId: v.id("applications"),
    firstPageStorageId: v.id("_storage"),
    lastPageStorageId: v.id("_storage"),
  },
  handler: async (ctx, { applicationId, firstPageStorageId, lastPageStorageId }): Promise<{
    passportDataId: Id<"passportData">;
    isValid: boolean;
    data: MRZExtracted;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });

    // Fetch image bytes for OCR
    const firstPageUrl = await ctx.storage.getUrl(firstPageStorageId);
    const lastPageUrl = await ctx.storage.getUrl(lastPageStorageId);

    if (!firstPageUrl || !lastPageUrl) {
      throw new ConvexError({ code: "STORAGE_ERROR", message: "Could not retrieve uploaded images" });
    }

    // Call Claude Vision to extract MRZ
    const extracted = await callVisionOCR(firstPageUrl, lastPageUrl);

    // Validate MRZ check digits
    const isValid = validateMRZCheckDigits(extracted.mrz1, extracted.mrz2);

    // Extract back-page personal details from last page
    const backPage = await extractBackPageData(lastPageUrl);

    // Write to DB via internal mutation (actions can't write directly)
    const passportDataId = await ctx.runMutation(internal.passports.saveExtracted, {
      applicationId,
      tokenIdentifier: identity.tokenIdentifier,
      ...extracted,
      isValid,
      firstPageStorageId,
      lastPageStorageId,
      fathersName: backPage.fathersName ?? undefined,
      mothersName: backPage.mothersName ?? undefined,
      spouseName: backPage.spouseName ?? undefined,
      address: backPage.address ?? undefined,
    });

    // Always link so the flow can proceed regardless of MRZ validity
    await ctx.runMutation(api.applications.linkPassport, {
      applicationId,
      passportDataId,
    });

    return { passportDataId, isValid, data: extracted };
  },
});

// ─── Internal mutation: save OCR result ──────────────────────

export const saveExtracted = internalMutation({
  args: {
    applicationId: v.id("applications"),
    tokenIdentifier: v.string(),
    surname: v.string(),
    givenNames: v.string(),
    nationality: v.string(),
    dateOfBirth: v.string(),
    sex: v.union(v.literal("M"), v.literal("F"), v.literal("X")),
    expiryDate: v.string(),
    passportNumber: v.string(),
    issuingCountry: v.string(),
    mrz1: v.string(),
    mrz2: v.string(),
    isValid: v.boolean(),
    checkDigitsPassed: v.boolean(),
    firstPageStorageId: v.id("_storage"),
    lastPageStorageId: v.id("_storage"),
    fathersName: v.optional(v.string()),
    mothersName: v.optional(v.string()),
    spouseName: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND" });
    requireOwnership(app.createdBy, args.tokenIdentifier, "application");

    return await ctx.db.insert("passportData", {
      applicationId: args.applicationId,
      createdBy: args.tokenIdentifier,
      surname: args.surname,
      givenNames: args.givenNames,
      nationality: args.nationality,
      dateOfBirth: args.dateOfBirth,
      sex: args.sex,
      expiryDate: args.expiryDate,
      passportNumber: args.passportNumber,
      issuingCountry: args.issuingCountry,
      mrz1: args.mrz1,
      mrz2: args.mrz2,
      isValid: args.isValid,
      checkDigitsPassed: args.checkDigitsPassed,
      firstPageStorageId: args.firstPageStorageId,
      lastPageStorageId: args.lastPageStorageId,
      fathersName: args.fathersName,
      mothersName: args.mothersName,
      spouseName: args.spouseName,
      address: args.address,
      createdAt: Date.now(),
    });
  },
});

// ─── Mutation: update passport fields (user edits) ───────────

export const updateFields = mutation({
  args: {
    applicationId: v.id("applications"),
    surname: v.optional(v.string()),
    givenNames: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    sex: v.optional(v.union(v.literal("M"), v.literal("F"), v.literal("X"))),
    expiryDate: v.optional(v.string()),
    passportNumber: v.optional(v.string()),
    issuingCountry: v.optional(v.string()),
    nationality: v.optional(v.string()),
    fathersName: v.optional(v.string()),
    mothersName: v.optional(v.string()),
    spouseName: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, { applicationId, ...fields }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    const existing = await ctx.db
      .query("passportData")
      .withIndex("by_application", q => q.eq("applicationId", applicationId))
      .unique();
    if (!existing) throw new ConvexError({ code: "NOT_FOUND" });

    // Only update provided fields
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(existing._id, patch);
  },
});

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

// ─── MRZ helpers ─────────────────────────────────────────────

interface MRZExtracted {
  surname: string;
  givenNames: string;
  nationality: string;
  dateOfBirth: string;
  sex: "M" | "F" | "X";
  expiryDate: string;
  passportNumber: string;
  issuingCountry: string;
  mrz1: string;
  mrz2: string;
  checkDigitsPassed: boolean;
}

interface BackPageData {
  fathersName: string | null;
  mothersName: string | null;
  spouseName: string | null;
  address: string | null;
}

/** Extract personal details from passport back page (last page). */
async function extractBackPageData(lastPageUrl: string): Promise<BackPageData> {
  try {
    const base64 = await urlToBase64(lastPageUrl);
    const text = await callVision(
      [{ base64, mimeType: "image/jpeg" }],
      `Extract personal details from this passport back page. Return ONLY valid JSON:
{
  "fathersName": "<father's name or null>",
  "mothersName": "<mother's name or null>",
  "spouseName": "<spouse/husband/wife name or null>",
  "address": "<permanent address or null>"
}
If a field is not visible or not present, use null.`,
      512
    );
    return JSON.parse(stripJsonFences(text)) as BackPageData;
  } catch {
    return { fathersName: null, mothersName: null, spouseName: null, address: null };
  }
}

/**
 * Groq Vision (Llama 4 Scout) → Gemini fallback for passport MRZ extraction.
 */
async function callVisionOCR(
  firstPageUrl: string,
  lastPageUrl: string
): Promise<MRZExtracted> {
  const firstPageBase64 = await urlToBase64(firstPageUrl);
  const lastPageBase64 = await urlToBase64(lastPageUrl);

  let text: string;
  try {
    text = await callVision(
      [
        { base64: firstPageBase64, mimeType: "image/jpeg" },
        { base64: lastPageBase64, mimeType: "image/jpeg" },
      ],
      `Extract the Machine Readable Zone (MRZ) data from this passport.

Return a JSON object with these exact fields:
{
  "surname": "SMITH",
  "givenNames": "JOHN WILLIAM",
  "nationality": "GBR",
  "dateOfBirth": "1990-05-15",
  "sex": "M",
  "expiryDate": "2030-05-14",
  "passportNumber": "AB1234567",
  "issuingCountry": "GBR",
  "mrz1": "<full MRZ line 1 exactly as printed>",
  "mrz2": "<full MRZ line 2 exactly as printed>"
}

Dates must be YYYY-MM-DD format. Sex must be M, F, or X. Return ONLY valid JSON.`,
      1024
    );
  } catch (e) {
    throw new ConvexError({ code: "OCR_FAILED", message: String(e) });
  }

  const parsed = JSON.parse(stripJsonFences(text)) as Partial<MRZExtracted>;

  const checkDigitsPassed = validateMRZCheckDigits(
    parsed.mrz1 ?? "",
    parsed.mrz2 ?? ""
  );

  return {
    surname: parsed.surname ?? "",
    givenNames: parsed.givenNames ?? "",
    nationality: parsed.nationality ?? "",
    dateOfBirth: parsed.dateOfBirth ?? "",
    sex: (parsed.sex ?? "X") as "M" | "F" | "X",
    expiryDate: parsed.expiryDate ?? "",
    passportNumber: parsed.passportNumber ?? "",
    issuingCountry: parsed.issuingCountry ?? "",
    mrz1: parsed.mrz1 ?? "",
    mrz2: parsed.mrz2 ?? "",
    checkDigitsPassed,
  };
}

/**
 * Validates ICAO 9303 MRZ check digits.
 * Weights: 7, 3, 1 repeating.
 */
function calculateCheckDigit(field: string): number {
  const weights = [7, 3, 1];
  const charValues: Record<string, number> = {};

  for (let i = 0; i < 26; i++) {
    charValues[String.fromCharCode(65 + i)] = i + 10; // A=10, B=11, ...
  }
  for (let i = 0; i <= 9; i++) {
    charValues[String(i)] = i;
  }
  charValues["<"] = 0;

  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const char = field[i] ?? "<";
    const val = charValues[char] ?? 0;
    const weight = weights[i % 3] ?? 7;
    sum += val * weight;
  }
  return sum % 10;
}

function validateMRZCheckDigits(mrz1: string, mrz2: string): boolean {
  if (mrz1.length !== 44 || mrz2.length !== 44) return false;

  try {
    // Check digit for passport number (positions 9, check at 14)
    const passportNumberCheck = calculateCheckDigit(mrz2.slice(0, 9));
    if (passportNumberCheck !== parseInt(mrz2[9] ?? "0")) return false;

    // Check digit for date of birth (positions 14, check at 19)
    const dobCheck = calculateCheckDigit(mrz2.slice(13, 19));
    if (dobCheck !== parseInt(mrz2[19] ?? "0")) return false;

    // Check digit for expiry (positions 21, check at 26)
    const expiryCheck = calculateCheckDigit(mrz2.slice(21, 27));
    if (expiryCheck !== parseInt(mrz2[27] ?? "0")) return false;

    return true;
  } catch {
    return false;
  }
}
