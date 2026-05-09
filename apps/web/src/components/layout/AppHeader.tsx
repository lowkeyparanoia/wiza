"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApprovalChance } from "@/components/ui/ApprovalChance";
import { cn } from "@/lib/utils";

const NAV_TABS = [
  { label: "Personal", href: "#personal", icon: PersonIcon },
  { label: "Financial", href: "#financial", icon: FinancialIcon },
  { label: "Travel", href: "#travel", icon: TravelIcon },
  { label: "Additional", href: "#additional", icon: ListIcon },
] as const;

interface AppHeaderProps {
  approvalChance?: number;
}

export function AppHeader({ approvalChance = 25 }: AppHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Wordmark */}
        <Link
          href="/dashboard"
          className="shrink-0 text-lg font-bold tracking-tight text-blue-600 hover:text-blue-700"
        >
          wiza
        </Link>

        {/* Nav tabs */}
        <nav aria-label="Application sections" className="hidden sm:flex">
          <ul className="flex items-center gap-1">
            {NAV_TABS.map(({ label, href, icon: Icon }) => {
              const isActive = pathname?.includes(href.replace("#", "").toLowerCase());
              return (
                <li key={label}>
                  <a
                    href={href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-600"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Approval Chance */}
        <ApprovalChance percentage={approvalChance} />
      </div>
    </header>
  );
}

// ─── Tab icons ────────────────────────────────────────────────

function PersonIcon({ className }: { className?: string }) {
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
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
      />
    </svg>
  );
}

function FinancialIcon({ className }: { className?: string }) {
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
        d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function TravelIcon({ className }: { className?: string }) {
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
        d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
      />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
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
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
      />
    </svg>
  );
}
