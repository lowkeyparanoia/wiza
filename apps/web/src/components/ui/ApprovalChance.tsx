"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ApprovalChanceProps {
  percentage: number;
  className?: string;
}

export function ApprovalChance({ percentage, className }: ApprovalChanceProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Labels */}
      <div className="hidden flex-col items-end sm:flex">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">
          AI Analysis
        </span>
        <span className="text-xs font-medium text-gray-600">Approval Chance</span>
      </div>

      {/* Percentage */}
      <span
        className={cn(
          "text-xl font-bold tabular-nums",
          percentage >= 70
            ? "text-green-500"
            : percentage >= 40
              ? "text-orange-400"
              : "text-orange-500",
        )}
      >
        {percentage}%
      </span>

      {/* Info icon */}
      <div className="relative">
        <button
          type="button"
          aria-label="About approval chance"
          className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400 hover:border-gray-400 hover:text-gray-600"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
        >
          i
        </button>

        {showTooltip && (
          <div className="absolute right-0 top-6 z-50 w-56 rounded-lg border border-gray-100 bg-white p-3 text-xs text-gray-600 shadow-lg">
            This score is calculated by our AI based on your application documents and profile
            completeness. It is an estimate only.
          </div>
        )}
      </div>
    </div>
  );
}
