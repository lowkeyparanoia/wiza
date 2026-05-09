"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useState } from "react";
import { StepBar } from "@/components/ui/StepBar";
import { UploadDropzone } from "@/components/ui/UploadDropzone";
import { PERSONAL_STEPS } from "@/lib/steps";
import { cn } from "@/lib/utils";

type PageView = "upload" | "info_review" | "validity";

interface ExtractedFields {
  passportNumber: string;
  surname: string;
  givenNames: string;
  dateOfBirth: string;
  sex: string;
  expiryDate: string;
  issuingCountry: string;
  nationality: string;
  // Back-page personal details
  fathersName: string;
  mothersName: string;
  spouseName: string;
  address: string;
}

export default function PassportPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params["applicationId"] as Id<"applications">;

  const application = useQuery(api.applications.get, { applicationId });
  const passport = useQuery(api.passports.get, { applicationId });

  const generateUrl = useAction(api.passports.generateUploadUrl);
  const extractAndVerify = useAction(api.passports.extractAndVerify);
  const updateFields = useMutation(api.passports.updateFields);

  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontStorageId, setFrontStorageId] = useState<Id<"_storage"> | null>(null);
  const [backStorageId, setBackStorageId] = useState<Id<"_storage"> | null>(null);
  const [frontUploading, setFrontUploading] = useState(false);
  const [backUploading, setBackUploading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<"front" | "back" | null>(null);
  const [view, setView] = useState<PageView>(() =>
    // If passport already extracted from a previous session, skip to info
    "upload"
  );

  // Editable extracted fields (pre-filled from OCR, user can edit)
  const [fields, setFields] = useState<ExtractedFields>({
    passportNumber: "", surname: "", givenNames: "",
    dateOfBirth: "", sex: "", expiryDate: "",
    issuingCountry: "", nationality: "",
    fathersName: "", mothersName: "", spouseName: "", address: "",
  });

  // if (application === undefined || passport === undefined) return <PageSkeleton />;

  // Resume from previous session: passport already extracted
  const hasExistingPassport = passport !== null && passport !== undefined;

  async function uploadFile(
    file: File,
    setUploading: (v: boolean) => void,
    setStorageId: (id: Id<"_storage">) => void,
  ) {
    setUploading(true);
    try {
      const url = await generateUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error();
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setStorageId(storageId);
    } finally {
      setUploading(false);
    }
  }

  async function handleExtract() {
    if (!frontStorageId || !backStorageId) return;
    setIsVerifying(true);
    setError(null);
    try {
      const result = await extractAndVerify({
        applicationId,
        firstPageStorageId: frontStorageId,
        lastPageStorageId: backStorageId,
      });
      const p = (result as unknown as { data: ExtractedFields & Record<string, string> }).data ?? result as unknown as ExtractedFields;
      setFields({
        passportNumber: (p as Record<string,string>).passportNumber ?? "",
        surname: (p as Record<string,string>).surname ?? "",
        givenNames: (p as Record<string,string>).givenNames ?? "",
        dateOfBirth: (p as Record<string,string>).dateOfBirth ?? "",
        sex: (p as Record<string,string>).sex ?? "",
        expiryDate: (p as Record<string,string>).expiryDate ?? "",
        issuingCountry: (p as Record<string,string>).issuingCountry ?? "",
        nationality: (p as Record<string,string>).nationality ?? "",
        fathersName: (p as Record<string,string>).fathersName ?? "",
        mothersName: (p as Record<string,string>).mothersName ?? "",
        spouseName: (p as Record<string,string>).spouseName ?? "",
        address: (p as Record<string,string>).address ?? "",
      });
      setView("info_review");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Extraction failed: ${msg}`);
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleConfirmInfo() {
    // Persist user edits back to DB
    await updateFields({
      applicationId,
      surname: fields.surname || undefined,
      givenNames: fields.givenNames || undefined,
      dateOfBirth: fields.dateOfBirth || undefined,
      sex: (fields.sex as "M" | "F" | "X") || undefined,
      expiryDate: fields.expiryDate || undefined,
      passportNumber: fields.passportNumber || undefined,
      issuingCountry: fields.issuingCountry || undefined,
      nationality: fields.nationality || undefined,
      fathersName: fields.fathersName || undefined,
      mothersName: fields.mothersName || undefined,
      spouseName: fields.spouseName || undefined,
      address: fields.address || undefined,
    }).catch(() => null); // non-blocking
    setView("validity");
  }

  function handleNext() {
    router.push(`/apply/${applicationId}/occupation`);
  }

  // ── On resume: if passport already exists, populate fields and skip to validity
  if (hasExistingPassport && view === "upload") {
    const p = passport as unknown as Record<string, string> & { isValid: boolean };
    if (fields.passportNumber === "" && p.passportNumber) {
      setFields({
        passportNumber: p.passportNumber ?? "",
        surname: p.surname ?? "",
        givenNames: p.givenNames ?? "",
        dateOfBirth: p.dateOfBirth ?? "",
        sex: p.sex ?? "",
        expiryDate: p.expiryDate ?? "",
        issuingCountry: p.issuingCountry ?? "",
        nationality: p.nationality ?? "",
        fathersName: p.fathersName ?? "",
        mothersName: p.mothersName ?? "",
        spouseName: p.spouseName ?? "",
        address: p.address ?? "",
      });
      setView("validity");
    }
  }

  const isPassportValid = hasExistingPassport
    ? (passport as unknown as { isValid: boolean }).isValid
    : false;

  const bothUploaded = frontStorageId !== null && backStorageId !== null
    && !frontUploading && !backUploading;

  return (
    <div className="mx-auto max-w-xl px-4 py-4 sm:py-8">
      <StepBar steps={PERSONAL_STEPS.passport} className="mb-6" />

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="px-6 py-6 sm:px-8">
          <h1 className="text-center text-xl font-bold text-gray-900 sm:text-2xl">
            {view === "info_review" ? "Passport" : view === "validity" ? "Passport" : "Upload Your Passport"}
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            {view === "upload"
              ? "Upload the first (photo) page and the last page of your passport."
              : view === "info_review"
                ? "Please provide your passport information."
                : isPassportValid
                  ? "Your passport meets the required validity criteria."
                  : "We could not verify your passport. Please try again."}
            {" "}
            {view !== "validity" && (
              <button type="button" className="font-medium text-blue-600 hover:underline">
                What&apos;s this?
              </button>
            )}
          </p>

          {/* ── Upload view ── */}
          {view === "upload" && (
            <div className="mt-6 flex flex-col gap-5">
              {/* Green info hint */}
              <div className="flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <p className="text-xs text-green-700">
                  Upload clear images of both pages. We&apos;ll extract your details automatically.
                </p>
              </div>

              {/* Front page */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-700">
                    Front page{" "}
                    <span className="text-xs font-normal text-gray-400">(photo page)</span>
                  </label>
                  {frontFile && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget("front")}
                      className="rounded p-1 text-gray-300 hover:text-red-400"
                      aria-label="Delete front page"
                    >
                      <TrashBtnIcon />
                    </button>
                  )}
                </div>
                <UploadDropzone
                  accept="image/jpeg,image/png,application/pdf"
                  maxSizeMB={10}
                  uploading={frontUploading}
                  uploadedFileName={frontFile?.name}
                  onFile={file => {
                    setFrontFile(file);
                    uploadFile(file, setFrontUploading, setFrontStorageId);
                  }}
                  label="Upload or scan"
                  sublabel="Supported: JPG, PNG, PDF (Max 10MB)"
                />
              </div>

              {/* Back page */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-700">
                    Last page{" "}
                    <span className="text-xs font-normal text-gray-400">(MRZ / barcode page)</span>
                  </label>
                  {backFile && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget("back")}
                      className="rounded p-1 text-gray-300 hover:text-red-400"
                      aria-label="Delete back page"
                    >
                      <TrashBtnIcon />
                    </button>
                  )}
                </div>
                <UploadDropzone
                  accept="image/jpeg,image/png,application/pdf"
                  maxSizeMB={10}
                  uploading={backUploading}
                  uploadedFileName={backFile?.name}
                  onFile={file => {
                    setBackFile(file);
                    uploadFile(file, setBackUploading, setBackStorageId);
                  }}
                  label="Upload or scan"
                  sublabel="Supported: JPG, PNG, PDF (Max 10MB)"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Info review view ── */}
          {view === "info_review" && (
            <div className="mt-5 flex flex-col gap-4">
              {/* Green info banner */}
              <div className="flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <p className="text-xs text-green-700">
                  Don&apos;t worry if details don&apos;t match exactly. You can edit any field below.
                  We&apos;ll highlight anything that needs attention before submission.
                </p>
              </div>

              {/* Front page section */}
              <Section title="Front Page">
                <FieldGroup
                  fields={[
                    { key: "passportNumber", label: "Passport No.*" },
                    { key: "surname", label: "Surname*" },
                    { key: "givenNames", label: "Given Name(s)*" },
                    { key: "dateOfBirth", label: "Date of Birth*", half: true },
                    { key: "sex", label: "Sex*", half: true },
                    { key: "issuingCountry", label: "Place of Issue*" },
                    { key: "expiryDate", label: "Date of Expiry*", half: true },
                    { key: "nationality", label: "Nationality*", half: true },
                  ]}
                  values={fields}
                  onChange={(key, val) => setFields(prev => ({ ...prev, [key]: val }))}
                />
              </Section>

              {/* Back page section */}
              <Section title="Back Page">
                <FieldGroup
                  fields={[
                    { key: "fathersName", label: "Father's Name" },
                    { key: "mothersName", label: "Mother's Name" },
                    { key: "spouseName", label: "Spouse's Name" },
                    { key: "address", label: "Address", multiline: true },
                  ]}
                  values={fields}
                  onChange={(key, val) => setFields(prev => ({ ...prev, [key]: val }))}
                />
              </Section>
            </div>
          )}

          {/* ── Validity view ── */}
          {view === "validity" && (
            <div className="mt-5 flex flex-col gap-3">
              {/* Passport card summary */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["Full Name", `${fields.givenNames} ${fields.surname}`],
                      ["Passport No.", fields.passportNumber],
                      ["Nationality", fields.nationality],
                      ["Date of Birth", fields.dateOfBirth],
                      ["Expiry Date", fields.expiryDate],
                      ["Sex", fields.sex],
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
                      <p className="mt-0.5 text-sm font-medium text-gray-800">{value || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Validity result */}
              {!isPassportValid ? (
                <>
                  {/* Insufficient validity card */}
                  <div className="rounded-2xl border border-gray-100 bg-white px-6 py-8 text-center shadow-sm">
                    <div className="mb-4 flex justify-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                        <AlertTriangleIcon className="h-7 w-7 text-red-500" />
                      </div>
                    </div>
                    <h3 className="mb-2 text-base font-bold text-gray-900">Passport Validity Insufficient</h3>
                    <p className="mb-6 text-sm leading-relaxed text-gray-500">
                      Your passport does not meet the{" "}
                      <strong className="text-gray-700">minimum validity requirement of 183 days</strong>{" "}
                      from the date of arrival. Please renew your passport before proceeding.
                    </p>
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Got It
                    </button>
                  </div>
                  {/* Failed badge */}
                  <VerifyBadge
                    label="Passport Validity Insufficient"
                    sublabel="This country requires minimum passport validity of 183 days from date of arrival."
                    ok={false}
                    loading={false}
                  />
                </>
              ) : (
                <VerifyBadge
                  label="Passport Valid"
                  sublabel="Valid for the required duration from your travel date"
                  ok
                  loading={false}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="border-t border-gray-100 px-6 py-4 sm:px-8">
          {view === "upload" && (
            <button
              type="button"
              onClick={handleExtract}
              disabled={!bothUploaded || isVerifying}
              className={cn(
                "flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-colors",
                bothUploaded && !isVerifying
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "cursor-not-allowed bg-gray-300",
              )}
            >
              {isVerifying ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Extracting details…
                </span>
              ) : (
                "Next"
              )}
            </button>
          )}

          {view === "info_review" && (
            <button
              type="button"
              onClick={handleConfirmInfo}
              className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Next
            </button>
          )}

          {/* Validity footer: only show Next when passport IS valid; invalid shows "Got It" inside the card */}
          {view === "validity" && isPassportValid && (
            <button
              type="button"
              onClick={handleNext}
              className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Next
            </button>
          )}
        </div>
      </div>

      <Footer />

      {/* Delete image confirmation modal */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-white px-6 py-8 sm:rounded-2xl">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                <DeleteTrashIcon className="h-7 w-7 text-red-500" />
              </div>
            </div>
            <h2 className="mb-2 text-center text-lg font-bold text-gray-900">Delete this image?</h2>
            <p className="mb-6 text-center text-sm text-gray-500">
              This will remove the {deleteTarget === "front" ? "front" : "back"} page image. You can re-upload a new one.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteTarget === "front") {
                    setFrontFile(null);
                    setFrontStorageId(null);
                  } else {
                    setBackFile(null);
                    setBackStorageId(null);
                  }
                  setDeleteTarget(null);
                }}
                className="flex flex-1 items-center justify-center rounded-xl bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-4 rounded-full border-2 border-blue-500 bg-blue-500 flex items-center justify-center">
          <CheckSmall className="h-2.5 w-2.5 text-white" />
        </div>
        <p className="text-xs font-semibold text-gray-700">{title}</p>
      </div>
      {children}
    </div>
  );
}

interface FieldDef { key: keyof ExtractedFields; label: string; half?: boolean; multiline?: boolean }

function FieldGroup({
  fields: defs,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: ExtractedFields;
  onChange: (key: keyof ExtractedFields, val: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {defs.map(({ key, label, half, multiline }) => (
        <div key={key} className={half ? "" : "col-span-2"}>
          <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
          {multiline ? (
            <textarea
              rows={2}
              value={values[key]}
              onChange={e => onChange(key, e.target.value)}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          ) : (
            <input
              type="text"
              value={values[key]}
              onChange={e => onChange(key, e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function VerifyBadge({
  label, sublabel, ok, loading,
}: { label: string; sublabel: string; ok: boolean; loading: boolean }) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border px-4 py-3",
      loading ? "border-gray-200 bg-gray-50"
        : ok ? "border-green-200 bg-green-50"
          : "border-red-200 bg-red-50",
    )}>
      <div className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        loading ? "bg-gray-100" : ok ? "bg-green-100" : "bg-red-100",
      )}>
        {loading ? <Spinner /> : ok
          ? <CheckSmall className="h-3 w-3 text-green-600" />
          : <XIcon className="h-3 w-3 text-red-500" />}
      </div>
      <div className="flex-1">
        <p className={cn("text-sm font-semibold",
          loading ? "text-gray-600" : ok ? "text-green-800" : "text-red-700"
        )}>{label}</p>
        <p className={cn("text-xs",
          loading ? "text-gray-400" : ok ? "text-green-600" : "text-red-500"
        )}>{sublabel}</p>
      </div>
      <span className={cn(
        "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap",
        loading ? "bg-gray-100 text-gray-500"
          : ok ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-600",
      )}>
        {loading ? "Verifying..." : ok ? "Verified" : "Failed"}
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
        <div className="mx-auto mb-3 h-6 w-48 rounded-lg bg-gray-200" />
        <div className="mx-auto h-3 w-64 rounded bg-gray-100" />
        <div className="mt-6 space-y-4">
          <div className="h-32 rounded-xl bg-gray-100" />
          <div className="h-32 rounded-xl bg-gray-100" />
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

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function CheckSmall({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2 6l2.5 2.5L10 3" /></svg>;
}

function XIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2 2l8 8M10 2l-8 8" /></svg>;
}

function InfoIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>;
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 1.999-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.501-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>;
}

function TrashBtnIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>;
}

function DeleteTrashIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z" clipRule="evenodd" /></svg>;
}
