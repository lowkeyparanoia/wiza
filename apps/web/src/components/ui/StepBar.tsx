import { cn } from "@/lib/utils";

export type StepStatus = "complete" | "active" | "upcoming";

export interface Step {
  label: string;
  status: StepStatus;
}

interface StepBarProps {
  steps: Step[];
  className?: string;
}

export function StepBar({ steps, className }: StepBarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-0 py-3",
        className,
      )}
      aria-label="Progress"
    >
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          {/* Connector line before (skip first) */}
          {i > 0 && (
            <div
              className={cn(
                "h-px w-8 sm:w-14 transition-colors",
                step.status === "complete" || steps[i - 1]?.status === "complete"
                  ? "bg-blue-500"
                  : "bg-gray-200",
              )}
            />
          )}

          {/* Step node */}
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
                step.status === "complete" &&
                  "bg-blue-500 text-white",
                step.status === "active" &&
                  "bg-blue-500 text-white ring-2 ring-blue-200",
                step.status === "upcoming" &&
                  "border-2 border-gray-300 bg-white text-gray-400",
              )}
              aria-current={step.status === "active" ? "step" : undefined}
            >
              {step.status === "complete" ? (
                <CheckIcon />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>

            <span
              className={cn(
                "hidden text-center text-[10px] leading-tight sm:block sm:max-w-[72px]",
                step.status === "active" && "font-semibold text-blue-600",
                step.status === "complete" && "text-gray-500",
                step.status === "upcoming" && "text-gray-400",
              )}
            >
              {step.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path
        fillRule="evenodd"
        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
