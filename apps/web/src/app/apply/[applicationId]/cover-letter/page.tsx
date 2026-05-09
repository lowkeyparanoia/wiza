"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { StepBar } from "@/components/ui/StepBar";
import { UploadDropzone } from "@/components/ui/UploadDropzone";
import { DOC_STEPS } from "@/lib/steps";
import { cn } from "@/lib/utils";

// ─── Page ─────────────────────────────────────────────────────

export default function CoverLetterPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params["applicationId"] as Id<"applications">;

  // ── Convex subscriptions ──
  const application = useQuery(api.applications.get, { applicationId });
  const coverLetter = useQuery(api.coverLetters.getByApplication, { applicationId });
  const existingDocs = useQuery(api.documents.listByApplication, { applicationId });

  // ── Convex actions / mutations ──
  const generate = useAction(api.coverLetters.generate);
  const generateUploadUrl = useAction(api.documents.generateUploadUrl);
  const generateLogoUploadUrl = useAction(api.coverLetters.generateLogoUploadUrl);
  const saveLogo = useMutation(api.coverLetters.saveLogo);
  const approve = useMutation(api.coverLetters.approve);

  // ── Local state ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isProceedLoading, setIsProceedLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<{ name: string; storageId: Id<"_storage"> }[]>([]);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);

  async function handleAdditionalFile(file: File) {
    setUploadingAdditional(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setAdditionalFiles(prev => [...prev, { name: file.name, storageId }]);
    } finally {
      setUploadingAdditional(false);
    }
  }

  function runGenerate() {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerateError(null);
    const ids = additionalFiles.map(f => f.storageId);
    generate({
      applicationId,
      additionalStorageIds: ids.length > 0 ? ids : undefined,
    })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setGenerateError(msg || "Generation failed. Check Convex dashboard for details.");
      })
      .finally(() => setIsGenerating(false));
  }

  // Auto-generate on first arrival for employed users
  useEffect(() => {
    if (application === undefined || coverLetter === undefined) return;
    if (application === null) return;
    if (application.occupationType === "self_employed") return;
    if (coverLetter !== null) return;
    if (isGenerating) return;
    runGenerate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application?._id, coverLetter === null]);

  if (application === undefined || coverLetter === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (application === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-gray-500">Application not found.</p>
      </div>
    );
  }

  const isSelfEmployed = application?.occupationType === "self_employed";
  const destination = application?.destination ?? "#country";

  // ── Handlers ──

  async function handleLogoUpload(file: File) {
    setIsUploadingLogo(true);
    setLogoFile(file);
    try {
      const uploadUrl = await generateLogoUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await saveLogo({ applicationId, logoStorageId: storageId });
    } catch {
      setLogoFile(null);
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function handleProceed() {
    setIsProceedLoading(true);
    try {
      if (coverLetter && !coverLetter.approved) {
        await approve({ coverLetterId: coverLetter._id });
      }
      router.push(`/dashboard`);
    } finally {
      setIsProceedLoading(false);
    }
  }

  // ── Derived values ──
  const canProceed = isSelfEmployed
    ? coverLetter !== null && coverLetter.logoStorageId !== undefined
    : coverLetter !== null;

  return (
    <div className="mx-auto max-w-xl px-4 py-4 sm:py-8">
      {/* Step bar */}
      <StepBar steps={DOC_STEPS.coverLetter} className="mb-6" />

      {/* Card */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="px-6 py-6 sm:px-8">
          {/* Title */}
          <h1 className="text-center text-xl font-bold text-gray-900 sm:text-2xl">
            {isSelfEmployed
              ? "Cover Letter for Self-Employed Applicant"
              : "Cover Letter for Visa Application"}
          </h1>

          {/* Subtitle */}
          <p className="mt-2 text-center text-sm text-gray-500">
            {isSelfEmployed
              ? "As a self-employed applicant, your cover letter must be on your business letterhead."
              : coverLetter
                ? "Please review the form carefully and make any necessary edits before submission."
                : "Your cover letter has been generated based on your application details."}
          </p>

          {/* ── AI context files panel ── */}
          <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
              AI Context — files used for generation
            </p>

            {/* Existing docs */}
            {existingDocs && existingDocs.length > 0 ? (
              <ul className="mb-3 flex flex-col gap-1.5">
                {existingDocs.map(doc => (
                  <li key={doc._id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <DocTypeIcon type={doc.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-700">{doc.fileName}</p>
                      <p className="text-[10px] capitalize text-gray-400">{doc.type.replace(/_/g, " ")}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-500">
                      In use
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-xs text-gray-400">No documents uploaded yet — cover letter will use application info only.</p>
            )}

            {/* Additional files */}
            {additionalFiles.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1.5">
                {additionalFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                    <FileIcon className="h-4 w-4 shrink-0 text-blue-400" />
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-blue-700">{f.name}</p>
                    <button
                      type="button"
                      onClick={() => setAdditionalFiles(prev => prev.filter((_, j) => j !== i))}
                      className="shrink-0 text-[10px] text-blue-400 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Upload additional */}
            <UploadDropzone
              accept="application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              maxSizeMB={10}
              onFile={handleAdditionalFile}
              uploading={uploadingAdditional}
              label="Add your CV / Resume or any other supporting document"
              sublabel="PDF, Word, JPG or PNG — the AI will read it and personalise the letter"
            />
          </div>

          {/* ── Self-employed variant ── */}
          {isSelfEmployed ? (
            <SelfEmployedContent
              destination={destination}
              onLogoUpload={handleLogoUpload}
              isUploadingLogo={isUploadingLogo}
              logoFile={logoFile}
            />
          ) : (
            /* ── Employed / standard variant ── */
            <EmployedContent
              destination={destination}
              coverLetter={coverLetter}
              isGenerating={isGenerating}
              generateError={generateError}
              onGenerate={runGenerate}
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="border-t border-gray-100 px-6 py-4 sm:px-8">
          {/* Regenerate button — employed only */}
          {!isSelfEmployed && (
            <button
              type="button"
              onClick={runGenerate}
              disabled={isGenerating}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <SmallSpinner />
                  Generating…
                </>
              ) : (
                <>
                  <EditIcon className="h-4 w-4" />
                  {coverLetter ? "Regenerate" : "Generate Cover Letter"}
                </>
              )}
            </button>
          )}

          {/* Proceed / Next */}
          <button
            type="button"
            onClick={handleProceed}
            disabled={!canProceed || isProceedLoading || isGenerating}
            className={cn(
              "flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-colors",
              canProceed && !isProceedLoading && !isGenerating
                ? "bg-blue-600 hover:bg-blue-700"
                : "cursor-not-allowed bg-blue-300",
            )}
          >
            {isProceedLoading ? (
              <span className="flex items-center gap-2">
                <SmallSpinner />
                Saving…
              </span>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>

      {/* Footer disclaimer */}
      <p className="mt-6 text-center text-[11px] leading-relaxed text-gray-400">
        Your documents are securely collected and shared with your travel agent only.
        <br />
        Please note that visa approval is solely at the discretion of the embassy&apos;s visa
        officer.
      </p>
    </div>
  );
}

// ─── Employed content ─────────────────────────────────────────

type CoverLetterDoc = {
  _id: Id<"coverLetters">;
  content: string;
  approved: boolean;
  logoStorageId?: Id<"_storage">;
  destination?: string;
  applicantName: string;
  occupation: string;
  version: number;
};

interface EmployedContentProps {
  destination: string;
  coverLetter: CoverLetterDoc | null;
  isGenerating: boolean;
  generateError: string | null;
  onGenerate: () => void;
}

function EmployedContent({
  destination,
  coverLetter,
  isGenerating,
  generateError,
  onGenerate,
}: EmployedContentProps) {
  if (isGenerating) {
    return (
      <div className="mt-6 flex flex-col items-center justify-center gap-3 py-12">
        <LargeSpinner />
        <p className="text-sm text-gray-500">Generating your cover letter…</p>
      </div>
    );
  }

  if (generateError) {
    return (
      <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">
        <p className="font-medium">Generation failed</p>
        <p className="mt-1 text-xs text-red-500">{generateError}</p>
        <button
          type="button"
          onClick={onGenerate}
          className="mt-3 text-xs font-medium text-red-600 underline hover:text-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!coverLetter) {
    return (
      <div className="mt-6 flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-gray-500">No cover letter generated yet.</p>
        <button
          type="button"
          onClick={onGenerate}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Generate Cover Letter
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Success banner */}
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <CheckIcon className="h-4 w-4 shrink-0 text-green-500" />
        <p className="text-sm font-medium text-green-700">
          Cover letter generated — {destination} visa
        </p>
      </div>

      {/* Full letter text */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Your Cover Letter (v{coverLetter.version})
          </p>
        </div>
        <div className="max-h-[420px] overflow-y-auto px-6 py-5">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700">
            {coverLetter.content}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── Self-employed content ────────────────────────────────────

interface SelfEmployedContentProps {
  destination: string;
  onLogoUpload: (file: File) => void;
  isUploadingLogo: boolean;
  logoFile: File | null;
}

function SelfEmployedContent({
  destination,
  onLogoUpload,
  isUploadingLogo,
  logoFile,
}: SelfEmployedContentProps) {
  return (
    <div className="mt-5 flex flex-col gap-5">
      {/* Warning banner */}
      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
        <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-amber-800">
            Important: Business Letterhead Required
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-700">
            For self-employed applicants, the cover letter must be printed on your company&apos;s
            official letterhead. This is a mandatory requirement by the {destination} Embassy.
          </p>
        </div>
      </div>

      {/* Logo upload */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          Choose your letterhead option:
        </h2>
        <UploadDropzone
          accept="image/jpeg,image/png,application/pdf"
          maxSizeMB={5}
          onFile={onLogoUpload}
          uploading={isUploadingLogo}
          uploadedFileName={logoFile?.name}
          label="Upload or scan"
          sublabel="Supported: JPG, PNG, PDF (Max 5MB)"
        />
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-xl animate-pulse px-4 py-8">
      <div className="mb-6 flex justify-center gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-7 rounded-full bg-gray-200" />
        ))}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="px-8 py-6">
          <div className="mx-auto mb-3 h-6 w-48 rounded-lg bg-gray-200" />
          <div className="mx-auto h-3 w-64 rounded bg-gray-100" />
          <div className="mt-6 h-64 rounded-xl bg-gray-100" />
        </div>
        <div className="border-t border-gray-100 px-8 py-4">
          <div className="h-11 rounded-xl bg-gray-200" />
          <div className="mt-3 h-11 rounded-xl bg-blue-100" />
        </div>
      </div>
    </div>
  );
}

// ─── Small icon components ────────────────────────────────────

function FileIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function DocTypeIcon({ type, className }: { type: string; className?: string }) {
  const color =
    type === "salary_slip" ? "text-green-400" :
    type === "bank_statement" ? "text-blue-400" :
    type === "leave_letter" ? "text-orange-400" :
    type === "itr" ? "text-purple-400" :
    "text-gray-400";
  return <FileIcon className={`h-4 w-4 shrink-0 ${color} ${className ?? ""}`} />;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.06-1.06l-3.795 3.795-1.545-1.545a.75.75 0 0 0-1.06 1.06l2.1 2.1a.75.75 0 0 0 1.06 0l4.3-4.35Z" clipRule="evenodd" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 1.999-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.501-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SmallSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}

function LargeSpinner() {
  return (
    <svg
      className="h-10 w-10 animate-spin text-blue-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}
