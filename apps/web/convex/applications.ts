import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireIdentity, requireOwnership } from "./lib/auth";

// ─── Queries ──────────────────────────────────────────────────

/** Get single application with ownership check. */
export const get = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const app = await ctx.db.get(applicationId);
    if (!app) return null;
    if (app.createdBy !== identity.tokenIdentifier) return null;

    return app;
  },
});

/** List all applications for current traveler. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("applications")
      .withIndex("by_creator", q => q.eq("createdBy", identity.tokenIdentifier))
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────

/** Start a new application (draft). */
export const create = mutation({
  args: {
    destination: v.optional(v.string()),
    visaType: v.optional(v.string()),
    travelDateFrom: v.optional(v.string()),
    travelDateTo: v.optional(v.string()),
  },
  handler: async (ctx, { destination, visaType, travelDateFrom, travelDateTo }) => {
    const traveler = await requireAuth(ctx);
    const now = Date.now();

    return await ctx.db.insert("applications", {
      travelerId: traveler._id,
      createdBy: traveler.tokenIdentifier,
      status: "draft",
      destination,
      visaType,
      travelDateFrom,
      travelDateTo,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Record passport data linkage after OCR is complete. */
export const linkPassport = mutation({
  args: {
    applicationId: v.id("applications"),
    passportDataId: v.id("passportData"),
  },
  handler: async (ctx, { applicationId, passportDataId }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    await ctx.db.patch(applicationId, {
      passportDataId,
      status: "passport_verified",
      updatedAt: Date.now(),
    });
  },
});

/** Set occupation type. */
export const setOccupation = mutation({
  args: {
    applicationId: v.id("applications"),
    occupationType: v.union(
      v.literal("salaried"),
      v.literal("self_employed"),
      v.literal("real_estate"),
      v.literal("student"),
      v.literal("homemaker"),
      v.literal("retired"),
      v.literal("not_employed")
    ),
    employmentSubtype: v.optional(
      v.union(v.literal("private"), v.literal("government"))
    ),
  },
  handler: async (ctx, { applicationId, occupationType, employmentSubtype }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    await ctx.db.patch(applicationId, {
      occupationType,
      ...(employmentSubtype ? { employmentSubtype } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Set destination country. */
export const setDestination = mutation({
  args: {
    applicationId: v.id("applications"),
    destination: v.string(),
  },
  handler: async (ctx, { applicationId, destination }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    await ctx.db.patch(applicationId, { destination, updatedAt: Date.now() });
  },
});

/** Mark documents as fully uploaded. */
export const markDocumentsUploaded = mutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    await ctx.db.patch(applicationId, {
      status: "documents_uploaded",
      updatedAt: Date.now(),
    });
  },
});

/** Link generated cover letter. */
export const linkCoverLetter = mutation({
  args: {
    applicationId: v.id("applications"),
    coverLetterId: v.id("coverLetters"),
  },
  handler: async (ctx, { applicationId, coverLetterId }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    await ctx.db.patch(applicationId, {
      coverLetterId,
      status: "cover_letter_generated",
      updatedAt: Date.now(),
    });
  },
});

/** Delete a draft application (only allowed before submission). */
export const remove = mutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");
    await ctx.db.delete(applicationId);
  },
});

/** Final submission. */
export const submit = mutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const identity = await requireIdentity(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found" });
    requireOwnership(app.createdBy, identity.tokenIdentifier, "application");

    // Validate all required steps are complete
    if (!app.passportDataId) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Passport verification required" });
    }
    if (!app.occupationType) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Occupation type required" });
    }
    if (!app.coverLetterId) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Cover letter required" });
    }

    const now = Date.now();
    await ctx.db.patch(applicationId, {
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    });
  },
});
