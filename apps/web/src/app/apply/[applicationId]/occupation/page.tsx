"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useState } from "react";
import { StepBar } from "@/components/ui/StepBar";
import { InfoModal } from "@/components/ui/InfoModal";
import { DATA_STEPS } from "@/lib/steps";
import { cn } from "@/lib/utils";

type OccupationType = "salaried" | "self_employed" | "real_estate" | "student" | "homemaker" | "retired" | "not_employed";

const ALL_OPTIONS: { value: OccupationType; label: string }[] = [
  { value: "salaried", label: "Salaried-Employed" },
  { value: "self_employed", label: "Self-Employed" },
  { value: "real_estate", label: "Real Estate" },
  { value: "student", label: "Student" },
  { value: "homemaker", label: "Homemaker" },
  { value: "retired", label: "Retired" },
  { value: "not_employed", label: "Not Employed" },
];

// Figma order: Salaried-Employed, Self-Employed, Student, Real Estate
const POPULAR = [ALL_OPTIONS[0], ALL_OPTIONS[1], ALL_OPTIONS[3], ALL_OPTIONS[2]];

export default function OccupationPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params["applicationId"] as Id<"applications">;

  const application = useQuery(api.applications.get, { applicationId });
  const setOccupation = useMutation(api.applications.setOccupation);

  const [selected, setSelected] = useState<OccupationType | null>(
    (application?.occupationType as OccupationType) ?? null
  );
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Show real UI even while loading (Convex returns undefined when not connected)
  // if (application === undefined) return <PageSkeleton />;

  async function handleNext() {
    if (!selected) return;
    setSaving(true);
    try {
      await setOccupation({ applicationId, occupationType: selected });
      if (selected === "salaried") {
        router.push(`/apply/${applicationId}/employment-type`);
      } else if (selected === "self_employed" || selected === "real_estate") {
        // Self-employed: still go through employment documents
        router.push(`/apply/${applicationId}/documents/salary-slips`);
      } else {
        // Student / homemaker / retired / not employed: skip directly to banking
        router.push(`/apply/${applicationId}/documents/bank-statements`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-4 sm:py-8">
      <StepBar steps={DATA_STEPS.employmentDetails} className="mb-6" />

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="px-6 py-6 sm:px-8">
          <h1 className="text-center text-xl font-bold text-gray-900 sm:text-2xl">
            Occupation
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Select your occupation.{" "}
            <button type="button" onClick={() => setShowInfo(true)} className="font-medium text-blue-600 hover:underline">
              What&apos;s this?
            </button>
          </p>

          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-gray-700">
              What&apos;s your current occupation?
            </p>

            {/* Dropdown */}
            <div className="relative mb-4">
              <select
                value={selected ?? ""}
                onChange={e => setSelected(e.target.value as OccupationType || null)}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 pr-10 text-sm text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Choose an option</option>
                {ALL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>

            {/* Quick picks */}
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <StarIcon className="h-3 w-3 text-blue-500" />
              Popular choices
            </p>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelected(opt.value)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
                    selected === opt.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={handleNext}
            disabled={!selected || saving}
            className={cn(
              "flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-colors",
              selected && !saving
                ? "bg-blue-600 hover:bg-blue-700"
                : "cursor-not-allowed bg-gray-300",
            )}
          >
            {saving ? (
              <span className="flex items-center gap-2"><Spinner />Saving…</span>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>

      <Footer />

      {showInfo && (
        <InfoModal title="Occupation" onClose={() => setShowInfo(false)}>
          <p>Your occupation determines which financial and employment documents the embassy expects you to provide.</p>
          <p className="mt-3">For example, salaried employees submit salary slips and a leave letter, while self-employed applicants provide business registration and financials.</p>
        </InfoModal>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-xl animate-pulse px-4 py-8">
      <div className="mb-6 flex justify-center gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-7 w-7 rounded-full bg-gray-200" />)}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-8">
        <div className="mx-auto mb-3 h-6 w-32 rounded-lg bg-gray-200" />
        <div className="mt-6 h-12 rounded-xl bg-gray-100" />
        <div className="mt-3 flex gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-7 w-24 rounded-full bg-gray-100" />)}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <p className="mt-6 text-center text-[11px] leading-relaxed text-gray-400">
      Your documents are securely collected and shared with your travel agent only.
      <br />
      Please note that visa approval is solely at the discretion of the embassy&apos;s visa officer.
    </p>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}
