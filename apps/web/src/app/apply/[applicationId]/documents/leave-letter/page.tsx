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

type Phase =
  | "upload"               // initial upload
  | "uploading"
  | "details"              // OCR extracted — user reviews fields before confirming
  | "verifying"            // confirming OCR data → final verify
  | "verified"             // shows verification badges
  | "alt_upload"           // user selected "I don't have this" → show appointment letter upload
  | "alt_uploading"
  | "alt_details"          // alt doc OCR review
  | "alt_verifying"
  | "alt_verified";

interface VerifyResult {
  nameMatches: boolean;
  hasSeal: boolean;
  hasSignature: boolean;
  nameFound: string | null;
  documentType: string;
}

export default function LeaveLetter() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params["applicationId"] as Id<"applications">;

  const application = useQuery(api.applications.get, { applicationId });
  const passport = useQuery(api.passports.get, { applicationId });

  const generateUrl = useAction(api.documents.generateUploadUrl);
  const saveDoc = useMutation(api.documents.save);
  const verifyDoc = useAction(api.documents.verifyLeaveLetterDoc);

  const [phase, setPhase] = useState<Phase>("upload");
  const [noDoc, setNoDoc] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [mainDocId, setMainDocId] = useState<Id<"documents"> | null>(null);
  const [altDocId, setAltDocId] = useState<Id<"documents"> | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [showFormatModal, setShowFormatModal] = useState(false);
  // OCR details state
  const [ocrDetails, setOcrDetails] = useState({ companyName: "", designation: "", companyAddress: "" });

  // if (application === undefined || passport === undefined) return <PageSkeleton />;

  const applicantName = passport
    ? `${passport.givenNames} ${passport.surname}`.trim()
    : "";

  async function upload(
    file: File,
    type: "leave_letter" | "company_appointment_letter",
    isAlt: boolean,
  ) {
    setPhase(isAlt ? "alt_uploading" : "uploading");
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
        type,
        storageId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      if (isAlt) {
        setAltDocId(docId);
        setPhase("alt_verifying");
      } else {
        setMainDocId(docId);
        setPhase("verifying");
      }

      // OCR extraction — go to details review first
      try {
        const result = await verifyDoc({ documentId: docId, expectedName: applicantName });
        const r = result as VerifyResult & Record<string, string | null>;
        setOcrDetails({
          companyName: r["companyName"] ?? "",
          designation: r["designation"] ?? "",
          companyAddress: r["companyAddress"] ?? "",
        });
        setVerifyResult(result as VerifyResult);
      } catch {
        // OCR failure — skip details, go straight to verified
      }
      setPhase(isAlt ? "alt_details" : "details");
    } catch {
      setPhase(isAlt ? "alt_upload" : "upload");
    }
  }

  function handleConfirmDetails(isAlt: boolean) {
    setPhase(isAlt ? "alt_verified" : "verified");
  }

  function handleNext() {
    router.push(`/apply/${applicationId}/documents/itr`);
  }

  const isVerified = phase === "verified" || phase === "alt_verified";
  const isDetails = phase === "details" || phase === "alt_details";
  const isAltPhase = phase.startsWith("alt");

  return (
    <div className="mx-auto max-w-xl px-4 py-4 sm:py-8">
      <StepBar steps={DATA_STEPS.employmentDocuments} className="mb-6" />

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="px-6 py-6 sm:px-8">
          <h1 className="text-center text-xl font-bold text-gray-900 sm:text-2xl">
            {phase === "alt_verified"
              ? "Company Appointment Letter"
              : isDetails && isAltPhase
                ? "Company Appointment Letter"
                : isDetails
                  ? "Leave Sanction Letter / NOC details"
                  : (isAltPhase || noDoc) && !isDetails
                    ? "Leave Sanction Letter / NOC"
                    : "Upload Leave Sanction Letter / NOC"}
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            {isVerified
              ? `We've verified the details on your ${phase === "alt_verified" ? "Company Appointment Letter" : "leave sanction letter or NOC from company"}.`
              : isDetails
                ? `We've extracted details from your ${isAltPhase ? "Company Appointment Letter" : "Leave Sanction Letter / NOC"}. Please review and confirm.`
                : "Please upload your leave sanction letter or NOC from company. "}
            {!isVerified && !isDetails && (
              <button type="button" onClick={() => setShowInfo(true)} className="font-medium text-blue-600 hover:underline">
                What&apos;s this?
              </button>
            )}
          </p>

          <div className="mt-6">
            {isVerified && verifyResult ? (
              <VerifiedView result={verifyResult} applicantName={applicantName} phase={phase} />
            ) : isDetails ? (
              /* OCR details review */
              <OcrDetailsView
                ocrDetails={ocrDetails}
                setOcrDetails={setOcrDetails}
                isAlt={isAltPhase}
                onConfirm={() => handleConfirmDetails(isAltPhase)}
              />
            ) : (
              <>
                {/* Main upload (NOC / leave letter) — always visible */}
                <UploadDropzone
                  uploading={phase === "uploading"}
                  onFile={f => upload(f, "leave_letter", false)}
                  label="Upload or scan"
                  sublabel="Supported: JPG, PNG, PDF (Max 5MB)"
                />

                {/* "I don't have this document" */}
                <label className={cn(
                  "mt-3 flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3",
                  noDoc ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:bg-gray-50",
                )}>
                  <input
                    type="checkbox"
                    checked={noDoc}
                    onChange={e => setNoDoc(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-blue-500"
                  />
                  <div>
                    <p className={cn("text-sm font-medium", noDoc ? "text-orange-800" : "text-gray-700")}>
                      I don&apos;t have this document
                    </p>
                    <p className={cn("text-xs", noDoc ? "text-orange-600" : "text-gray-400")}>
                      You can upload an alternative document instead
                    </p>
                  </div>
                </label>

                {/* Alternative: Company Appointment Letter */}
                {noDoc && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Company Appointment Letter
                    </p>
                    <p className="mb-3 text-xs text-gray-500">
                      Please upload your Company Appointment Letter instead.
                    </p>
                    <UploadDropzone
                      uploading={phase === "alt_uploading"}
                      onFile={f => upload(f, "company_appointment_letter", true)}
                      label="Upload or scan"
                      sublabel="Supported: JPG, PNG, PDF (Max 5MB)"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer actions — hidden during details review (OcrDetailsView has its own confirm) */}
        {!isDetails && (
          <div className="border-t border-gray-100 px-6 py-4 sm:px-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleNext}
              disabled={!isVerified}
              className={cn(
                "flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-colors",
                isVerified ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-gray-300",
              )}
            >
              Next
            </button>

            {!isVerified && (
              <button
                type="button"
                onClick={() => setShowFormatModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                <EyeIcon className="h-4 w-4" />
                View Format
              </button>
            )}
          </div>
        )}
      </div>

      <Footer />

      {showInfo && (
        <InfoModal title="Leave Sanction Letter / NOC" onClose={() => setShowInfo(false)}>
          <p>A Leave Sanction Letter or No Objection Certificate (NOC) from your employer confirms your employment status and that your company permits you to travel during this period.</p>
          <p className="mt-3">It assures the embassy that you have a job to return to and <strong>genuine ties to your home country</strong>.</p>
        </InfoModal>
      )}

      {/* Format modal */}
      {showFormatModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white px-5 py-6 sm:rounded-2xl">
            {/* Header */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
              <DocIcon className="h-5 w-5 shrink-0 text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Leave Sanction Letter Format</p>
                <p className="text-xs text-gray-400">2 Pages</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowFormatModal(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            {/* Preview */}
            <div className="mb-4 flex h-56 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
              <span className="italic text-sm text-gray-400">Format</span>
            </div>
            {/* Download */}
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <DownloadIcon className="h-4 w-4" />
              Download Format
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OCR details review ───────────────────────────────────────

interface OcrDetails { companyName: string; designation: string; companyAddress: string }

function OcrDetailsView({
  ocrDetails, setOcrDetails, isAlt, onConfirm,
}: {
  ocrDetails: OcrDetails;
  setOcrDetails: (d: OcrDetails) => void;
  isAlt: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Doc preview */}
      <div className="flex h-44 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-400">DOC preview</span>
      </div>

      {/* Editable fields */}
      {(["companyName", "designation", "companyAddress"] as const).map(field => (
        <div key={field}>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            {field === "companyName" ? "Company Name" : field === "designation" ? "Designation" : "Company Address"}
          </label>
          <div className="flex items-center rounded-xl border border-green-300 bg-green-50 px-3 py-2.5">
            <input
              value={ocrDetails[field]}
              onChange={e => setOcrDetails({ ...ocrDetails, [field]: e.target.value })}
              className="flex-1 bg-transparent text-sm text-gray-800 outline-none"
            />
            <CheckSmall className="ml-2 h-4 w-4 shrink-0 text-green-500" />
          </div>
        </div>
      ))}

      <div className="mt-1">
        <button
          type="button"
          onClick={onConfirm}
          className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Verified state display ───────────────────────────────────

function VerifiedView({
  result,
  applicantName,
  phase,
}: {
  result: VerifyResult;
  applicantName: string;
  phase: Phase;
}) {
  const isAlt = phase === "alt_verified";

  return (
    <div className="flex flex-col gap-3">
      {/* Document thumbnail */}
      <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-400">DOC preview</span>
      </div>

      {/* Verification badges */}
      <VerifyBadge
        label="Traveller Name Verified"
        sublabel={`#TRAVELLER NAME confirmed on ${isAlt ? "Company Appointment Letter" : "Company Appointment Letter"}`}
        ok={result.nameMatches}
      />

      {!isAlt && (
        <VerifyBadge
          label="Seal & Sign Verified"
          sublabel="Company seal and authorized signature confirmed on document"
          ok={result.hasSeal && result.hasSignature}
        />
      )}
    </div>
  );
}

function VerifyBadge({
  label,
  sublabel,
  ok,
}: {
  label: string;
  sublabel: string;
  ok: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border px-4 py-3",
      ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50",
    )}>
      <div className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        ok ? "bg-green-100" : "bg-red-100",
      )}>
        {ok ? (
          <CheckSmall className="h-3 w-3 text-green-600" />
        ) : (
          <XIcon className="h-3 w-3 text-red-500" />
        )}
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

// ─── Utils ────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-xl animate-pulse px-4 py-8">
      <div className="mb-6 flex justify-center gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-7 w-7 rounded-full bg-gray-200" />)}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-8">
        <div className="mx-auto mb-3 h-6 w-52 rounded-lg bg-gray-200" />
        <div className="mt-6 h-36 rounded-xl bg-gray-100" />
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

function EyeIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>;
}

function DocIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>;
}

function DownloadIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
}

function CheckSmall({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2 6l2.5 2.5L10 3" /></svg>;
}

function XIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2 2l8 8M10 2l-8 8" /></svg>;
}
