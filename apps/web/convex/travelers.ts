import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireIdentity } from "./lib/auth";

/** Create traveler profile on first sign-in (idempotent). */
export const upsert = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    const existing = await ctx.db
      .query("travelers")
      .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("travelers", {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email ?? undefined,
      createdAt: Date.now(),
    });
  },
});

/** Get current traveler's profile. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("travelers")
      .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
  },
});
