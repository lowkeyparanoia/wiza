"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";

// ─── Step definitions ────────────────────────────────────────

const FLOW_STEPS = [
  { label: "Passport", route: "passport", doneStatuses: ["passport_verified", "documents_uploaded", "cover_letter_generated", "submitted"] },
  { label: "Occupation", route: "occupation", doneStatuses: ["documents_uploaded", "cover_letter_generated", "submitted"] },
  { label: "Salary Slips", route: "documents/salary-slips", doneStatuses: ["documents_uploaded", "cover_letter_generated", "submitted"] },
  { label: "Bank Statements", route: "documents/bank-statements", doneStatuses: ["documents_uploaded", "cover_letter_generated", "submitted"] },
  { label: "Sponsor Letter", route: "sponsor-letter", doneStatuses: ["cover_letter_generated", "submitted"] },
  { label: "Invitation Letter", route: "invitation-letter", doneStatuses: ["cover_letter_generated", "submitted"] },
  { label: "Cover Letter", route: "cover-letter", doneStatuses: ["cover_letter_generated", "submitted"] },
];

function getStepState(stepIndex: number, status: string | undefined): "done" | "active" | "pending" {
  const s = status ?? "draft";
  const step = FLOW_STEPS[stepIndex]!;
  if (step.doneStatuses.includes(s)) return "done";
  // active = first step that isn't done
  for (let i = 0; i < stepIndex; i++) {
    if (!FLOW_STEPS[i]!.doneStatuses.includes(s)) return "pending";
  }
  return "active";
}

function resumeRoute(
  id: Id<"applications">,
  status: string | undefined,
  occupationType: string | undefined,
): string {
  const base = `/apply/${id}`;
  switch (status) {
    case "draft":
      return `${base}/passport`;
    case "passport_verified":
      return `${base}/documents/salary-slips`;
    case "documents_uploaded":
      return `${base}/cover-letter`;
    case "cover_letter_generated":
    case "submitted":
      return `${base}/cover-letter`;
    default:
      return `${base}/occupation`;
  }
}

const DESTINATIONS = [
  { label: "Schengen (Europe)", value: "Schengen" },
  { label: "United Kingdom", value: "United Kingdom" },
  { label: "United States", value: "United States" },
  { label: "Canada", value: "Canada" },
  { label: "Australia", value: "Australia" },
  { label: "Other", value: "" },
];

export default function DashboardPage() {
  const router = useRouter();
  const upsertTraveler = useMutation(api.travelers.upsert);
  const createApplication = useMutation(api.applications.create);
  const removeApplication = useMutation(api.applications.remove);
  const applications = useQuery(api.applications.list);

  const [expandedId, setExpandedId] = useState<Id<"applications"> | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerStep, setPickerStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState("Schengen");
  const [custom, setCustom] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [creating, setCreating] = useState(false);

  function resetPicker() {
    setShowPicker(false);
    setPickerStep(1);
    setSelected("Schengen");
    setCustom("");
    setDateFrom("");
    setDateTo("");
  }

  useEffect(() => {
    upsertTraveler({}).catch(console.error);
  }, [upsertTraveler]);

  async function handleCreate() {
    setCreating(true);
    try {
      const destination = selected === "" ? custom.trim() || "Other" : selected;
      const id = await createApplication({
        destination,
        visaType: "tourist",
        travelDateFrom: dateFrom || undefined,
        travelDateTo: dateTo || undefined,
      });
      resetPicker();
      router.push(`/apply/${id}/passport`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-gray-100 bg-white px-6 shadow-sm">
        <span className="text-lg font-bold tracking-tight text-blue-600">wiza</span>
        <UserButton />
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <h2 className="text-2xl font-bold text-gray-900">Your Applications</h2>

        {applications === undefined && (
          <p className="mt-4 text-sm text-gray-500">Loading...</p>
        )}

        {applications?.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">No applications yet.</p>
        )}

        {applications && applications.length > 0 && (
          <ul className="mt-6 space-y-3">
            {applications.map((app) => {
              const isExpanded = expandedId === app._id;
              return (
                <li key={app._id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  {/* Card header row */}
                  <div className="flex items-stretch gap-2 px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : app._id)}
                      className="flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-gray-800">
                        {app.destination ?? "Visa"} Application
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-xs text-gray-400">
                          {new Date(app._creationTime).toLocaleDateString()} &middot;{" "}
                          <span className="capitalize">{(app.status ?? "draft").replace(/_/g, " ")}</span>
                        </p>
                        {(app.status === "cover_letter_generated" || app.status === "submitted") && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            ✓ Cover letter ready
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : app._id)}
                        className="flex items-center justify-center rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-400 hover:border-blue-200 hover:text-blue-500"
                      >
                        {isExpanded ? "▲" : "▼"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Delete this application?")) {
                            removeApplication({ applicationId: app._id }).catch(console.error);
                          }
                        }}
                        className="flex items-center justify-center rounded-lg border border-gray-200 px-2 py-1 text-gray-400 hover:border-red-200 hover:text-red-400"
                        aria-label="Delete application"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Expanded progress panel */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Application Progress</p>
                      <ol className="space-y-2">
                        {FLOW_STEPS.map((step, i) => {
                          const state = getStepState(i, app.status);
                          return (
                            <li key={step.route} className="flex items-center gap-3">
                              {/* Indicator */}
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                state === "done"
                                  ? "bg-green-500 text-white"
                                  : state === "active"
                                  ? "bg-orange-400 text-white"
                                  : "bg-gray-100 text-gray-400"
                              }`}>
                                {state === "done" ? "✓" : i + 1}
                              </span>
                              {/* Label */}
                              <span className={`text-sm ${
                                state === "done"
                                  ? "text-green-700 line-through decoration-green-300"
                                  : state === "active"
                                  ? "font-semibold text-orange-600"
                                  : "text-gray-400"
                              }`}>
                                {step.label}
                              </span>
                              {state === "active" && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                                  In progress
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                      <button
                        type="button"
                        onClick={() => router.push(resumeRoute(app._id, app.status, app.occupationType))}
                        className="mt-4 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Continue →
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!showPicker ? (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="mt-8 flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + New Application
          </button>
        ) : (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">

            {/* Step indicators */}
            <div className="mb-5 flex items-center gap-2">
              {([1, 2] as const).map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${pickerStep >= s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>{s}</div>
                  {s < 2 && <div className={`h-px w-8 ${pickerStep > s ? "bg-blue-400" : "bg-gray-200"}`} />}
                </div>
              ))}
              <span className="ml-1 text-xs text-gray-400">
                {pickerStep === 1 ? "Destination" : "Travel Dates"}
              </span>
            </div>

            {/* Step 1 — Destination */}
            {pickerStep === 1 && (
              <>
                <h3 className="text-base font-semibold text-gray-900">Where are you applying?</h3>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {DESTINATIONS.map((d) => (
                    <button key={d.value} type="button" onClick={() => setSelected(d.value)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${selected === d.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700 hover:border-blue-300"}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
                {selected === "" && (
                  <input type="text" placeholder="Country or region" value={custom}
                    onChange={e => setCustom(e.target.value)}
                    className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
                )}
              </>
            )}

            {/* Step 2 — Travel dates */}
            {pickerStep === 2 && (
              <>
                <h3 className="text-base font-semibold text-gray-900">When do you plan to travel?</h3>
                <p className="mt-1 text-sm text-gray-500">Approximate dates are fine — these help the AI write a specific cover letter.</p>
                <div className="mt-4 flex flex-col gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Departure (approx.)</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Return (approx.)</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
                  </div>
                </div>
              </>
            )}

            {/* Nav buttons */}
            <div className="mt-5 flex gap-3">
              <button type="button"
                onClick={() => pickerStep === 1 ? resetPicker() : setPickerStep(1)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                {pickerStep === 1 ? "Cancel" : "Back"}
              </button>
              {pickerStep === 1 ? (
                <button type="button"
                  onClick={() => setPickerStep(2)}
                  disabled={selected === "" && !custom.trim()}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  Next
                </button>
              ) : (
                <button type="button" onClick={handleCreate} disabled={creating}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {creating ? "Creating…" : "Start Application"}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
