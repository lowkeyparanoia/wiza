"use client";

import { useEffect } from "react";

interface InfoModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function InfoModal({ title, children, onClose }: InfoModalProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white px-6 py-8 sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-blue-500">
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5A.75.75 0 0 0 12 9Z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        <h2 className="mb-3 text-center text-lg font-bold text-gray-900">{title}</h2>

        <div className="mb-6 text-center text-sm leading-relaxed text-gray-500 [&_strong]:font-semibold [&_strong]:text-gray-700">
          {children}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
