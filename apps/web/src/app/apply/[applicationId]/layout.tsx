"use client";

import { useParams } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useEffect, useRef } from "react";
import { AppHeader } from "@/components/layout/AppHeader";

export default function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const applicationId = params["applicationId"] as Id<"applications">;

  const application = useQuery(api.applications.get, { applicationId });
  const computeScore = useAction(api.scoring.computeScore);

  // Track which status we last scored so we re-score on each step advance
  const lastScoredStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!application) return;
    if (application.status === lastScoredStatus.current) return;
    lastScoredStatus.current = application.status;
    computeScore({ applicationId }).catch(() => {/* silent — score is non-critical */});
  }, [application?.status, applicationId, computeScore]);

  const score = application?.approvalScore ?? 25;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AppHeader approvalChance={score} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
