import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Require auth — returns traveler doc. Throws if not logged in or not found. */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Must be signed in" });
  }

  const traveler = await ctx.db
    .query("travelers")
    .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (!traveler) {
    throw new ConvexError({ code: "USER_NOT_FOUND", message: "Traveler profile not found" });
  }

  return traveler;
}

/** Get identity only — for mutations that need to create the traveler first. */
export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Must be signed in" });
  }
  return identity;
}

/** Ownership check — ensures the doc belongs to the calling user. */
export function requireOwnership(
  resourceCreatedBy: string,
  tokenIdentifier: string,
  resourceName = "resource"
) {
  if (resourceCreatedBy !== tokenIdentifier) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Not your ${resourceName}`,
    });
  }
}
