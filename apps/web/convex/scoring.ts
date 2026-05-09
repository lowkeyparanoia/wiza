import { ConvexError } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { callText } from "./lib/ai";

// ─── Internal query: gather all data for scoring ─────────────

export const getApplicationSnapshot = internalQuery({
  args: { applicationId: v.id("applications"), tokenIdentifier: v.string() },
  handler: async (ctx, { applicationId, tokenIdentifier }) => {
    const app = await ctx.db.get(applicationId);
    if (!app || app.createdBy !== tokenIdentifier) return null;

    const passport = app.passportDataId ? await ctx.db.get(app.passportDataId) : null;

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_application", q => q.eq("applicationId", applicationId))
      .collect();

    const coverLetter = app.coverLetterId ? await ctx.db.get(app.coverLetterId) : null;

    return {
      status: app.status,
      destination: app.destination ?? null,
      occupationType: app.occupationType ?? null,
      hasPassport: passport !== null,
      passportValid: passport?.isValid ?? false,
      passportExpiry: passport?.expiryDate ?? null,
      docTypes: docs.map(d => d.type),
      docCount: docs.length,
      salarySlipCount: docs.filter(d => d.type === "salary_slip").length,
      bankStatementCount: docs.filter(d => d.type === "bank_statement").length,
      bankData: docs
        .filter(d => d.type === "bank_statement" && d.extractedData)
        .map(d => d.extractedData as Record<string, unknown>),
      hasCoverLetter: coverLetter !== null,
      coverLetterApproved: coverLetter?.approved ?? false,
    };
  },
});

// ─── Internal mutation: save score ───────────────────────────

export const saveScore = internalMutation({
  args: { applicationId: v.id("applications"), score: v.number() },
  handler: async (ctx, { applicationId, score }) => {
    await ctx.db.patch(applicationId, {
      approvalScore: score,
      approvalScoreUpdatedAt: Date.now(),
    });
  },
});

// ─── Public action: compute + save score ─────────────────────

export const computeScore = action({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });

    const snap = await ctx.runQuery(internal.scoring.getApplicationSnapshot, {
      applicationId,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!snap) return null;

    let score = computeRuleBasedScore(snap); // rule-based fallback

    try {
      const prompt = buildScoringPrompt(snap);
      const text = await callText(prompt, 16, 0);
      const match = text.match(/\d{1,3}/);
      if (match) {
        const parsed = parseInt(match[0], 10);
        if (parsed >= 0 && parsed <= 100) score = parsed;
      }
    } catch {
      // both Groq and Gemini failed — use rule-based score
    }

    await ctx.runMutation(internal.scoring.saveScore, { applicationId, score });
    return score;
  },
});

// ─── Prompt builder ──────────────────────────────────────────

function buildScoringPrompt(snap: {
  status: string;
  destination: string | null;
  occupationType: string | null;
  hasPassport: boolean;
  passportValid: boolean;
  passportExpiry: string | null;
  docTypes: string[];
  docCount: number;
  salarySlipCount: number;
  bankStatementCount: number;
  bankData: Record<string, unknown>[];
  hasCoverLetter: boolean;
  coverLetterApproved: boolean;
}): string {
  const bankSummary = snap.bankData.map(d =>
    `closing balance: ${d.closingBalance ?? "unknown"} ${d.closingBalanceCurrency ?? ""}, covers 6 months: ${d.coversLast6Months ?? false}, meets minimum: ${d.meetsMinBalance ?? false}`
  ).join("; ");

  return `You are a visa approval analyst. Based on the applicant's profile below, estimate the probability (0-100) of their visa being approved.

Application profile:
- Destination: ${snap.destination ?? "not selected"}
- Occupation: ${snap.occupationType ?? "not set"}
- Passport: ${snap.hasPassport ? (snap.passportValid ? "valid" : "uploaded but MRZ invalid") : "not uploaded"}, expiry: ${snap.passportExpiry ?? "unknown"}
- Salary slips: ${snap.salarySlipCount} of 3 uploaded
- Bank statements: ${snap.bankStatementCount} uploaded${bankSummary ? `. Data: ${bankSummary}` : ""}
- Other docs: ${snap.docTypes.filter(t => t !== "salary_slip" && t !== "bank_statement").join(", ") || "none"}
- Cover letter: ${snap.hasCoverLetter ? (snap.coverLetterApproved ? "approved" : "generated, not approved") : "not generated"}
- Application status: ${snap.status}

Consider: document completeness, financial strength, passport validity, cover letter presence.
Respond with ONLY a single integer between 0 and 100. No explanation.`;
}

// ─── Rule-based fallback (no API key) ────────────────────────

function computeRuleBasedScore(snap: {
  hasPassport: boolean;
  passportValid: boolean;
  occupationType: string | null;
  salarySlipCount: number;
  bankStatementCount: number;
  bankData: Record<string, unknown>[];
  hasCoverLetter: boolean;
  coverLetterApproved: boolean;
}): number {
  let score = 10; // baseline

  if (snap.hasPassport) score += 20;
  if (snap.passportValid) score += 10;
  if (snap.occupationType) score += 10;
  score += Math.min(snap.salarySlipCount * 5, 15); // up to 15
  score += Math.min(snap.bankStatementCount * 3, 12); // up to 12

  const meetsBalance = snap.bankData.some(d => d.meetsMinBalance === true);
  if (meetsBalance) score += 10;

  if (snap.hasCoverLetter) score += 8;
  if (snap.coverLetterApproved) score += 5;

  return Math.min(score, 95);
}
