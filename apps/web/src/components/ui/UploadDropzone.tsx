"use client";

import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  accept?: string;
  maxSizeMB?: number;
  onFile: (file: File) => void;
  uploading?: boolean;
  uploadedFileName?: string;
  className?: string;
  label?: string;
  sublabel?: string;
  /** Reduce height for use inside grid slots */
  compact?: boolean;
}

export function UploadDropzone({
  accept = "image/jpeg,image/png,application/pdf",
  maxSizeMB = 5,
  onFile,
  uploading = false,
  uploadedFileName,
  className,
  label = "Upload or scan",
  sublabel = "Supported: JPG, PNG, PDF (Max 5MB)",
  compact = false,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateAndEmit(file: File) {
    setError(null);
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File must be smaller than ${maxSizeMB}MB`);
      return;
    }
    onFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndEmit(file);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndEmit(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file area"
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          compact
            ? "flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-4 transition-colors"
            : "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors",
          isDragging
            ? "border-blue-400 bg-blue-50"
            : uploadedFileName
              ? "border-green-300 bg-green-50"
              : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handleChange}
          aria-hidden
        />

        {uploading ? (
          <>
            <LoadingSpinner />
            <span className="text-sm text-gray-500">Uploading…</span>
          </>
        ) : uploadedFileName ? (
          <>
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
            <span className="max-w-[180px] truncate text-center text-sm font-medium text-green-700">
              {uploadedFileName}
            </span>
            <span className="text-xs text-gray-400">Click to replace</span>
          </>
        ) : (
          <>
            <UploadIcon className={compact ? "h-5 w-5 text-gray-400" : "h-8 w-8 text-gray-400"} />
            <span className={compact ? "text-xs font-medium text-gray-600" : "text-sm font-medium text-gray-600"}>{label}</span>
            <span className="text-[10px] text-gray-400">{sublabel}</span>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-blue-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}
