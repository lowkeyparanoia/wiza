"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useState } from "react";
import { StepBar } from "@/components/ui/StepBar";
import { InfoModal } from "@/components/ui/InfoModal";
import { UploadDropzone } from "@/components/ui/UploadDropzone";
import { DATA_STEPS } from "@/lib/steps";
import { cn } from "@/lib/utils";

type MissingReason = "not_filed" | "filing_pending" | "exempt" | "new_employee";

const MISSING_REASONS: { value: MissingReason; label: string }[] = [
  { value: "not_filed", label: "Was a student" },
  { value: "filing_pending", label: "Income below limit" },
  { value: "exempt", label: "I have not filed the latest year yet" },
  { value: "new_employee", label: "New employee" },
];

const YEAR_LABELS = ["Year 1", "Year 2", "Year 3"];

type SlotState =
  | { phase: "empty" }
  | { phase: "uploading" }
  | { phase: "uploaded"; documentId: Id<"documents">; fileName: string }
  | { phase: "missing_reason"; reason: MissingReason | null; confirmed: boolean };

export default function ItrPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params["applicationId"] as Id<"applications">;

  const application = useQuery(api.applications.get, { applicationId });
  const generateUrl = useAction(api.documents.generateUploadUrl);
  const saveDoc = useMutation(api.documents.save);
  const removeDoc = useMutation(api.documents.remove);

  const [showInfo, setShowInfo] = useState(false);
  const [slots, setSlots] = useState<SlotState[]>([
    { phase: "empty" },
    { phase: "empty" },
    { phase: "empty" },
  ]);

  // if (application === undefined) return <PageSkeleton />;

  function setSlotPhase(index: number, state: SlotState) {
    setSlots(prev => prev.map((s, i) => (i === index ? state : s)));
  }

  async function handleUpload(index: number, file: File) {
    setSlotPhase(index, { phase: "uploading" });
    try {
      const uploadUrl = await generateUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error();
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const docId = await saveDoc({
        applicationId,
        type: "itr",
        storageId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      setSlotPhase(index, { phase: "uploaded", documentId: docId, fileName: file.name });
    } catch {
      setSlotPhase(index, { phase: "empty" });
    }
  }

  async function handleRemove(index: number) {
    const slot = slots[index]!;
    if (slot.phase === "uploaded") {
      try { await removeDoc({ documentId: slot.documentId }); } catch { /* ok */ }
    }
    setSlotPhase(index, { phase: "empty" });
  }

  function toggleMissing(index: number) {
    const cur = slots[index]!;
    if (cur.phase === "missing_reason") {
      setSlotPhase(index, { phase: "empty" });
    } else if (cur.phase === "empty" || cur.phase === "uploading") {
      setSlotPhase(index, { phase: "missing_reason", reason: null, confirmed: false });
    }
  }

  function setMissingReason(index: number, reason: MissingReason) {
    setSlotPhase(index, { phase: "missing_reason", reason, confirmed: false });
  }

  function confirmMissingReason(index: number) {
    const slot = slots[index]!;
    if (slot.phase === "missing_reason" && slot.reason) {
      setSlotPhase(index, { phase: "missing_reason", reason: slot.reason, confirmed: true });
    }
  }

  const allResolved = slots.every(
    s => s.phase === "uploaded" || (s.phase === "missing_reason" && s.confirmed),
  );
  const anyUploaded = slots.some(s => s.phase === "uploaded");

  function handleNext() {
    router.push(`/apply/${applicationId}/documents/bank-statements`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:py-8">
      <StepBar steps={DATA_STEPS.employmentDocuments} className="mb-6" />

      {/* Info banner */}
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-xs text-blue-700">
          We recommend uploading ITR for the last 3 financial years. This helps strengthen your visa application.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="px-6 py-6 sm:px-8">
          <h1 className="text-center text-xl font-bold text-gray-900 sm:text-2xl">
            ITR Acknowledgement
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Please Upload your ITR documents.{" "}
            <button type="button" onClick={() => setShowInfo(true)} className="font-medium text-blue-600 hover:underline">
              What&apos;s this?
            </button>
          </p>

          {/* Subtitle changes when verified */}
          {allResolved && anyUploaded && (
            <p className="mt-1 text-center text-xs text-blue-600">
              We&apos;ve verified the details on your ITR documents.
            </p>
          )}

          {/* Year grid */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {YEAR_LABELS.map((label, i) => (
              <ItrSlot
                key={i}
                label={label}
                state={slots[i]!}
                onUpload={f => handleUpload(i, f)}
                onRemove={() => handleRemove(i)}
                onToggleMissing={() => toggleMissing(i)}
                onSelectReason={r => setMissingReason(i, r)}
                onConfirmReason={() => confirmMissingReason(i)}
                onGoBack={() => setSlotPhase(i, { phase: "empty" })}
              />
            ))}
          </div>

          {/* Verified badges — shown when at least one uploaded and all resolved */}
          {allResolved && anyUploaded && (
            <div className="mt-4 flex flex-col gap-2">
              <VerifyBadge
                label={`Last ${slots.filter(s => s.phase === "uploaded").length} Years Found`}
                sublabel="#DATES verified"
                ok
              />
              <VerifyBadge
                label="Traveller Name Verified"
                sublabel="#NAME verified"
                ok
              />
              {(() => {
                const skippedIdx = slots.findIndex(s => s.phase === "missing_reason" && (s as Extract<SlotState, { phase: "missing_reason" }>).confirmed);
                const skipped = slots[skippedIdx] as Extract<SlotState, { phase: "missing_reason" }> | undefined;
                const reasonLabel = MISSING_REASONS.find(r => r.value === skipped?.reason)?.label;
                return skipped && reasonLabel ? (
                  <p className="text-center text-xs text-gray-400">
                    Year {skippedIdx + 1} skipped because {reasonLabel.toLowerCase()}.
                  </p>
                ) : null;
              })()}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={handleNext}
            disabled={!allResolved && !anyUploaded}
            className={cn(
              "flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-colors",
              allResolved || anyUploaded
                ? "bg-blue-600 hover:bg-blue-700"
                : "cursor-not-allowed bg-gray-300",
            )}
          >
            Next
          </button>
          {!anyUploaded && !allResolved && (
            <button
              type="button"
              onClick={handleNext}
              className="mt-3 flex w-full items-center justify-center rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Skip — I don&apos;t have ITR documents
            </button>
          )}
        </div>
      </div>

      <Footer />

      {showInfo && (
        <InfoModal title="ITR Acknowledgement" onClose={() => setShowInfo(false)}>
          <p>ITR (Income Tax Return) Acknowledgement is proof that you have filed your annual taxes with the Income Tax Department of India.</p>
          <p className="mt-3">Embassies use it to verify your <strong>declared income and financial transparency</strong>. Upload the last 3 financial years for a stronger application.</p>
        </InfoModal>
      )}
    </div>
  );
}

// ─── Slot card ────────────────────────────────────────────────

interface ItrSlotProps {
  label: string;
  state: SlotState;
  onUpload: (f: File) => void;
  onRemove: () => void;
  onToggleMissing: () => void;
  onSelectReason: (r: MissingReason) => void;
  onConfirmReason: () => void;
  onGoBack: () => void;
}

function ItrSlot({
  label, state, onUpload, onRemove, onToggleMissing, onSelectReason, onConfirmReason, onGoBack,
}: ItrSlotProps) {
  const isUploaded = state.phase === "uploaded";
  const isMissing = state.phase === "missing_reason";
  const isConfirmedMissing = isMissing && state.confirmed;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-700 sm:text-sm">{label}</p>

      {!isMissing ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {isUploaded ? (
            <>
              <div className="flex h-24 items-center justify-center bg-gray-100 sm:h-28">
                <span className="text-xs text-gray-400">Doc Preview</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <CheckCircleSmall className="h-3 w-3 text-green-500" />
                  <span className="text-[10px] font-medium text-green-600">Document uploaded</span>
                </div>
                <div className="flex gap-1">
                  <button type="button" aria-label="Zoom in" className="rounded p-0.5 text-gray-400 hover:bg-gray-100"><ZoomInIcon /></button>
                  <button type="button" aria-label="Zoom out" className="rounded p-0.5 text-gray-400 hover:bg-gray-100"><ZoomOutIcon /></button>
                  <button type="button" aria-label="Remove" onClick={onRemove} className="rounded p-0.5 text-gray-300 hover:text-red-400"><TrashIcon /></button>
                </div>
              </div>
            </>
          ) : (
            <UploadDropzone
              uploading={state.phase === "uploading"}
              onFile={onUpload}
              label="Upload or scan"
              sublabel="JPG, PNG, PDF"
              compact
              className="border-0"
            />
          )}
        </div>
      ) : (
        <div className={cn(
          "rounded-xl border px-3 py-3",
          isConfirmedMissing ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50",
        )}>
          {isConfirmedMissing ? (
            <div className="flex flex-col items-center gap-1.5 py-2 text-center">
              <DocSkippedIcon className="h-7 w-7 text-gray-300" />
              <span className="text-[10px] font-semibold text-gray-600">Document Skipped</span>
              <span className="text-[10px] text-gray-400 leading-snug">
                {MISSING_REASONS.find(r => r.value === state.reason)?.label}
              </span>
              <button
                type="button"
                onClick={onGoBack}
                className="text-[10px] font-medium text-blue-600 hover:underline"
              >
                Upload instead
              </button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[10px] font-semibold text-amber-800">
                Why is this document missing?
              </p>
              <div className="mb-2 flex flex-col gap-1">
                {MISSING_REASONS.map(({ value, label: rl }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onSelectReason(value)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium text-left transition-colors",
                      isMissing && state.reason === value
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-gray-300 bg-white text-gray-600 hover:border-blue-300",
                    )}
                  >
                    {rl}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onGoBack}
                  className="flex-1 rounded-lg border border-gray-200 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={onConfirmReason}
                  disabled={!(isMissing && state.reason)}
                  className={cn(
                    "flex-1 rounded-lg py-1 text-[10px] font-semibold text-white",
                    isMissing && state.reason ? "bg-blue-600" : "cursor-not-allowed bg-gray-300",
                  )}
                >
                  Confirm
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!isUploaded && (
        <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-gray-500">
          <input
            type="checkbox"
            checked={isMissing}
            onChange={onToggleMissing}
            className="h-3 w-3 rounded border-gray-300 accent-blue-500"
          />
          I don&apos;t have this document
        </label>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 py-8">
      <div className="mb-6 flex justify-center gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-7 w-7 rounded-full bg-gray-200" />)}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-8">
        <div className="mx-auto mb-3 h-6 w-44 rounded-lg bg-gray-200" />
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-gray-100" />)}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <p className="mt-6 text-center text-[11px] leading-relaxed text-gray-400">
      Your documents are securely collected and shared with your travel agent only.
      <br />Please note that visa approval is solely at the discretion of the embassy&apos;s visa officer.
    </p>
  );
}

function ZoomInIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5"><path d="M9 6a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 9 6Z" /><path fillRule="evenodd" d="M2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Zm7-5.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" clipRule="evenodd" /></svg>;
}

function ZoomOutIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5"><path d="M6.75 8.25a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" /><path fillRule="evenodd" d="M9 2a7 7 0 1 0 4.391 12.452l3.329 3.328a.75.75 0 1 0 1.06-1.06l-3.328-3.329A7 7 0 0 0 9 2ZM3.5 9a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z" clipRule="evenodd" /></svg>;
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625Z" />
      <path d="M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z" />
    </svg>
  );
}

function TrashIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>;
}

function VerifyBadge({ label, sublabel, ok }: { label: string; sublabel: string; ok: boolean }) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border px-4 py-3",
      ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50",
    )}>
      <div className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        ok ? "bg-green-100" : "bg-red-100",
      )}>
        <CheckCircleSmall className={cn("h-3 w-3", ok ? "text-green-600" : "text-red-500")} />
      </div>
      <div className="flex-1">
        <p className={cn("text-sm font-semibold", ok ? "text-green-800" : "text-red-700")}>{label}</p>
        <p className={cn("text-xs", ok ? "text-green-600" : "text-red-500")}>{sublabel}</p>
      </div>
      <span className={cn(
        "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600",
      )}>
        {ok ? "Verified" : "Failed"}
      </span>
    </div>
  );
}

function DocSkippedIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875Zm6.905 9.97a.75.75 0 1 0-1.06 1.06l1.72 1.72-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06l-1.72-1.72 1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" clipRule="evenodd" /><path d="M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z" /></svg>;
}

function CheckCircleSmall({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg>;
}

function InfoIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>;
}
