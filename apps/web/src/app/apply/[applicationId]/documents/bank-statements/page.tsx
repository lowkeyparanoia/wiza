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

interface UploadedFile {
  id: Id<"documents">;
  name: string;
  size: number;
}

export default function BankStatementsPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params["applicationId"] as Id<"applications">;

  const application = useQuery(api.applications.get, { applicationId });
  const existingDocs = useQuery(api.documents.listByApplication, {
    applicationId,
    type: "bank_statement",
  });

  const generateUrl = useAction(api.documents.generateUploadUrl);
  const saveDoc = useMutation(api.documents.save);
  const removeDoc = useMutation(api.documents.remove);
  const verifyBankStatement = useAction(api.documents.verifyBankStatement);

  const [localFiles, setLocalFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // if (application === undefined || existingDocs === undefined) return <PageSkeleton />;

  const existingIds = new Set((existingDocs ?? []).map(d => d._id));
  const allUploads: UploadedFile[] = [
    ...(existingDocs ?? []).map(d => ({
      id: d._id,
      name: d.fileName,
      size: d.fileSize,
    })),
    ...localFiles.filter(f => !existingIds.has(f.id)),
  ];

  const canAddMore = allUploads.length < 6;
  const hasAtLeastOne = allUploads.length > 0;

  // Aggregate OCR data from all uploaded statements
  const allExtracted = (existingDocs ?? []).map(d => d.extractedData as BankExtractedData | undefined);
  const anyVerified = allExtracted.some(e => e?.accountHolderName);
  const firstVerified = allExtracted.find(e => e?.accountHolderName);

  // Compute composite verification info
  const travelerName = firstVerified?.accountHolderName ?? null;
  const nameOk = firstVerified?.nameMatches ?? false;
  // Find earliest start and latest end across all statements
  const startDates = allExtracted.map(e => e?.statementStartDate).filter(Boolean) as string[];
  const endDates = allExtracted.map(e => e?.statementEndDate).filter(Boolean) as string[];
  const dateRangeStr = startDates.length && endDates.length
    ? `${formatYearMonth(startDates.sort()[0]!)} – ${formatYearMonth(endDates.sort().reverse()[0]!)}`
    : null;
  const coversLast6 = allExtracted.some(e => e?.coversLast6Months);
  const maxBalance = allExtracted.reduce((max, e) => {
    const bal = e?.closingBalance ?? 0;
    return bal > max ? bal : max;
  }, 0);
  const meetsMinBalance = allExtracted.some(e => e?.meetsMinBalance);
  const balanceStr = maxBalance > 0 ? formatBalance(maxBalance) : null;

  async function handleUpload(file: File) {
    if (!canAddMore) return;
    setUploading(true);
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
        type: "bank_statement",
        storageId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      setLocalFiles(prev => [...prev, { id: docId, name: file.name, size: file.size }]);

      // Run OCR verification in background
      const appData = application;
      const expectedName = appData
        ? `${(appData as unknown as Record<string, unknown>).givenNames ?? ""} ${(appData as unknown as Record<string, unknown>).surname ?? ""}`.trim()
        : "";
      setVerifying(true);
      verifyBankStatement({ documentId: docId, expectedName }).finally(() => setVerifying(false));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(id: Id<"documents">) {
    try {
      await removeDoc({ documentId: id });
      setLocalFiles(prev => prev.filter(f => f.id !== id));
    } catch {
      // server-side remove handles existing docs
    }
  }

  function handleNext() {
    setShowNoticeModal(true);
  }

  function handleContinue() {
    setShowNoticeModal(false);
    router.push(`/apply/${applicationId}/sponsor-letter`);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-4 sm:py-8">
      <StepBar steps={DATA_STEPS.bankingDetails} className="mb-6" />

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="px-6 py-6 sm:px-8">
          <h1 className="text-center text-xl font-bold text-gray-900 sm:text-2xl">
            Bank Statement
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Please upload your last 6 months&apos; bank statement.{" "}
            <button type="button" onClick={() => setShowInfo(true)} className="font-medium text-blue-600 hover:underline">
              What&apos;s this?
            </button>
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {/* Uploaded file list with STATEMENT N labels */}
            {allUploads.map((file, index) => (
              <div key={file.id} className="flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Statement {index + 1}
                </p>
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
                  <PdfIcon className="h-8 w-8 shrink-0 text-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-700">{file.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => handleRemove(file.id)}
                    className="rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-400"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}

            {/* Dropzone — only show when below max */}
            {canAddMore && (
              <UploadDropzone
                accept="application/pdf,image/jpeg,image/png"
                maxSizeMB={10}
                uploading={uploading}
                onFile={handleUpload}
                label="Upload or scan"
                sublabel="Supported: JPG, PNG, PDF (Max 10MB)"
              />
            )}

            {/* Add another link */}
            {hasAtLeastOne && canAddMore && !uploading && (
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
              >
                <PlusIcon className="h-4 w-4" />
                Add another bank statement
              </button>
            )}

            {!canAddMore && (
              <p className="text-center text-xs text-gray-400">
                Maximum 6 bank statements uploaded.
              </p>
            )}

            {/* OCR verification badges */}
            {anyVerified && !verifying && (
              <div className="mt-2 flex flex-col gap-2">
                <VerifyRow
                  label="Traveler Name"
                  value={travelerName ? `#${travelerName}` : undefined}
                  ok={nameOk}
                />
                <VerifyRow
                  label="Date Check (Last 6 Months)"
                  value={dateRangeStr ? `#${dateRangeStr}` : undefined}
                  ok={coversLast6}
                />
                <VerifyRow
                  label="Closing Balance Check"
                  value={balanceStr ? `#${balanceStr}  Min. 1,50,000 required` : undefined}
                  ok={meetsMinBalance}
                />
              </div>
            )}

            {verifying && (
              <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                <SpinnerIcon className="h-4 w-4 animate-spin text-blue-500" />
                Verifying statement…
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={handleNext}
            disabled={!hasAtLeastOne}
            className={cn(
              "flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-colors",
              hasAtLeastOne ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-gray-300",
            )}
          >
            Next
          </button>
        </div>
      </div>

      <Footer />

      {showInfo && (
        <InfoModal title="Bank Statement" onClose={() => setShowInfo(false)}>
          <p>Your bank statement shows your recent transactions and balance, proving you have <strong>sufficient funds</strong> to cover your trip expenses without working abroad.</p>
          <p className="mt-3">Upload 6 months of statements from your primary savings or current account. The embassy will look at average balance and regularity of income deposits.</p>
          <p className="mt-3 text-xs text-orange-600 font-medium">Note: Also carry original physical statements when visiting the VFS centre.</p>
        </InfoModal>
      )}

      {/* Important Notice modal */}
      {showNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white px-6 py-8 sm:rounded-2xl">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-100">
                <WarningIcon className="h-7 w-7 text-orange-500" />
              </div>
            </div>
            <h2 className="mb-3 text-center text-lg font-bold text-gray-900">Important Notice</h2>
            <p className="mb-6 text-center text-sm leading-relaxed text-gray-500">
              The bank statement uploaded here is required only for agent reference only. Please ensure you carry{" "}
              <strong className="text-gray-700">the latest original bank statements</strong>{" "}
              when visiting the VFS Centre for your visa application submission.
            </p>
            <button
              type="button"
              onClick={handleContinue}
              className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────

interface BankExtractedData {
  accountHolderName: string | null;
  nameMatches: boolean;
  statementStartDate: string | null;
  statementEndDate: string | null;
  coversLast6Months: boolean;
  closingBalance: number | null;
  closingBalanceCurrency: string | null;
  meetsMinBalance: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatYearMonth(ym: string): string {
  // "2024-05" → "May 2024"
  const [year, month] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const m = parseInt(month ?? "1", 10);
  return `${months[m - 1] ?? month} ${year}`;
}

function formatBalance(n: number): string {
  return n.toLocaleString("en-IN");
}

// ─── Sub-components ───────────────────────────────────────────

function VerifyRow({ label, value, ok }: { label: string; value?: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {value && <p className="text-xs text-gray-400">{value}</p>}
      </div>
      {ok ? (
        <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600">
          <CheckIcon className="h-3.5 w-3.5" />
          Verified
        </span>
      ) : (
        <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500">
          <CrossIcon className="h-3.5 w-3.5" />
          Failed
        </span>
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
        <div className="mt-6 h-16 rounded-xl bg-gray-100" />
        <div className="mt-3 h-32 rounded-xl bg-gray-100" />
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

// ─── Icons ────────────────────────────────────────────────────

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625Z" />
      <path d="M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z" />
    </svg>
  );
}

function TrashIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>;
}

function PlusIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>;
}

function WarningIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 1.999-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.501-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>;
}

function CheckIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>;
}

function CrossIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>;
}

function SpinnerIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}
