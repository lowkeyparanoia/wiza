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

type SubType = "private" | "government";

const OPTIONS: { value: SubType; label: string; sublabel: string; Icon: React.FC<{ className?: string }> }[] = [
  {
    value: "private",
    label: "Salaried (Private)",
    sublabel: "Private sector company",
    Icon: RupeeIcon,
  },
  {
    value: "government",
    label: "Government Employed",
    sublabel: "Central / state government",
    Icon: BuildingIcon,
  },
];

export default function EmploymentTypePage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params["applicationId"] as Id<"applications">;

  const application = useQuery(api.applications.get, { applicationId });
  const setOccupation = useMutation(api.applications.setOccupation);

  const [selected, setSelected] = useState<SubType | null>(
    (application?.employmentSubtype as SubType) ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // if (application === undefined) return <PageSkeleton />;

  async function handleNext() {
    if (!selected) return;
    setSaving(true);
    try {
      await setOccupation({
        applicationId,
        occupationType: "salaried",
        employmentSubtype: selected,
      });
      router.push(`/apply/${applicationId}/documents/salary-slips`);
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
            Employment Type
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Select your employment type.{" "}
            <button type="button" onClick={() => setShowInfo(true)} className="font-medium text-blue-600 hover:underline">
              What&apos;s this?
            </button>
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {OPTIONS.map(({ value, label, sublabel, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelected(value)}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all",
                  selected === value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-blue-300",
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full",
                    selected === value ? "bg-blue-100" : "bg-gray-100",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      selected === value ? "text-blue-600" : "text-gray-500",
                    )}
                  />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", selected === value ? "text-blue-700" : "text-gray-800")}>
                    {label}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">{sublabel}</p>
                </div>
              </button>
            ))}
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
            {saving ? <span className="flex items-center gap-2"><Spinner />Saving…</span> : "Next"}
          </button>
        </div>
      </div>

      <Footer />

      {showInfo && (
        <InfoModal title="Employment Type" onClose={() => setShowInfo(false)}>
          <p><strong>Private Sector</strong> — employed by a private company. You&apos;ll need salary slips, a leave sanction letter, and your employment ID.</p>
          <p className="mt-3"><strong>Government Employed</strong> — working for a central or state government body. You&apos;ll need your government ID, NOC from your department, and salary certificate.</p>
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
        <div className="mx-auto mb-3 h-6 w-40 rounded-lg bg-gray-200" />
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="h-36 rounded-xl bg-gray-100" />
          <div className="h-36 rounded-xl bg-gray-100" />
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

function RupeeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
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
