"use client";

import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder.convex.cloud";

// Lazily instantiated so SSR never touches localStorage
let _client: ConvexReactClient | null = null;

export function getConvexClient(): ConvexReactClient {
  if (!_client) {
    _client = new ConvexReactClient(convexUrl);
  }
  return _client;
}

// Legacy export — resolved lazily via Proxy so the module import itself is SSR-safe
export const convex: ConvexReactClient = new Proxy({} as ConvexReactClient, {
  get(_target, prop) {
    return (getConvexClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
