"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Load ConvexProvider only on the client — prevents localStorage access during SSR
const ConvexProviderInner = dynamic(
  () => import("./ConvexProviderInner").then((m) => m.ConvexProviderInner),
  { ssr: false, loading: () => null },
);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProviderInner>{children}</ConvexProviderInner>;
}
