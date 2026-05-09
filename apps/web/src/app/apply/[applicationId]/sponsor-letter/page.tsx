"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useState } from "react";
import { StepBar } from "@/components/ui/StepBar";
import { InfoModal } from "@/components/ui/InfoModal";
import { UploadDropzone } from "@/components/ui/UploadDropzone";
import { DOC_STEPS } from "@/lib/steps";
import { cn } from "@/lib/utils";

interface UploadedFile {
  id: Id<"documents">;
  name: string;
  size: number;
}

export default function SponsorLetterPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params["applicationId"] as Id<"applications">;

  const application = useQuery(api.applications.get, { applicationId });
  const existingDocs = useQuery(api.documents.listByApplication, {
    applicationId,
    type: "sponsor_letter",
  });
  const generateUrl = useAction(api.documents.generateUploadUrl);
  const saveDoc = useMutation(api.documents.save);
  const removeDoc = useMutation(api.documents.remove);

  const [localFiles, setLocalFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showExtraDropzone, setShowExtraDropzone] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // if (application === undefined || existingDocs === undefined) return <PageSkeleton />;

  const existingIds = new Set((existingDocs ?? []).map(d => d._id));
  const allUploads: UploadedFile[] = [
    ...(existingDocs ?? []).map(d => ({ id: d._id, name: d.fileName, size: d.fileSize })),
    ...localFiles.filter(f => !existingIds.has(f.id)),
  ];

  const hasAtLeastOne = allUploads.length > 0;
  const destination = application?.destination ?? "the destination country";

  async function handleUpload(file: File) {
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
        type: "sponsor_letter",
        storageId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      setLocalFiles(prev => [...prev, { id: docId, name: file.name, size: file.size }]);
      setShowExtraDropzone(false);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(id: Id<"documents">) {
    try {
      await removeDoc({ documentId: id });
      setLocalFiles(prev => prev.filter(f => f.id !== id));
    } catch {
      // server handles existing docs
    }
  }

  function handleNext() {
    router.push(`/apply/${applicationId}/invitation-letter`);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-4 sm:py-8">
      <StepBar steps={DOC_STEPS.sponsorLetter} className="mb-6" />

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="px-6 py-6 sm:px-8">
          <h1 className="text-center text-xl font-bold text-gray-900 sm:text-2xl">
            Sponsor Letter
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Upload a sponsor letter if you have a host or sponsor in {destination}.{" "}
            <button type="button" onClick={() => setShowInfo(true)} className="font-medium text-blue-600 hover:underline">
              What&apos;s this?
            </button>
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {allUploads.map(file => (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"
              >
                <DocIcon className="h-8 w-8 shrink-0 text-blue-400" />
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
            ))}

            {(allUploads.length === 0 || showExtraDropzone) && (
              <UploadDropzone
                accept="application/pdf,image/jpeg,image/png"
                maxSizeMB={10}
                uploading={uploading}
                onFile={handleUpload}
                label="Upload or scan"
                sublabel="Supported: JPG, PNG, PDF (Max 10MB)"
              />
            )}

            {allUploads.length > 0 && !showExtraDropzone && (
              <button
                type="button"
                onClick={() => setShowExtraDropzone(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
              >
                <PlusIcon className="h-4 w-4" />
                Add another document
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 sm:px-8 flex flex-col gap-3">
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
          <button
            type="button"
            onClick={handleNext}
            className="flex w-full items-center justify-center rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            I don&apos;t have a sponsor letter
          </button>
        </div>
      </div>

      <Footer />

      {showInfo && (
        <InfoModal title="Sponsor Letter" onClose={() => setShowInfo(false)}>
          <p>A sponsor letter is from someone residing in the destination country who is hosting or sponsoring your visit.</p>
          <p className="mt-3">It should include their full name, address, contact details, your relationship to them, expected duration of stay, and a statement that they will cover your expenses (if applicable).</p>
          <p className="mt-3">Only upload this if you have a host or sponsor — skip if travelling independently.</p>
        </InfoModal>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

function DocIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>;
}

function TrashIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>;
}

function PlusIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>;
}
