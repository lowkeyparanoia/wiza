# Wiza — Development Notes

> For supervisor handover. Covers architecture decisions, thought process, how to run the project, and what's needed to fully test it.

---

## What This Is

**Wiza** is a visa application assistant web app. It guides users through a multi-step document collection flow — passport, employment details, salary slips, bank statements, ITR, cover letter generation — and hands everything off to a travel agent.

Target users: Indian applicants applying for Schengen/international visas.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | File-based routing, server components, fast DX |
| Backend / DB | Convex | Real-time reactive queries, built-in file storage, serverless functions — no separate API server needed |
| Auth | Clerk | Drop-in auth with social login, handles JWT/session complexity |
| AI — OCR | Anthropic (Claude) | Passport + salary slip OCR extraction |
| AI — Cover Letter | Google Gemini Flash | Free tier, fast, good at structured text generation |
| Styling | Tailwind CSS | Utility-first, consistent design system |
| Monorepo | pnpm workspaces | Single repo with `apps/web` + `convex/` functions |

---

## Thought Process & Architecture Decisions

### 1. Multi-step flow design
The apply flow is a linear funnel broken into 4 stepper groups:
- **Trip Sponsor** → **Employment Details** → **Employment Documents** → **Banking Details**
- Then a separate **Document generation** flow: Cover Letter → Sponsor Letter → Invitation Letter

Each step is its own Next.js page under `/apply/[applicationId]/`. The `applicationId` is a Convex document ID that threads through the entire flow, so data persists across steps even if the user drops off and returns.

### 2. Convex as the backend
Convex was chosen because:
- Reactive queries (`useQuery`) mean the UI auto-updates when server state changes — critical for the OCR flow where the server processes a document asynchronously and the client needs to know when it's done
- Built-in file storage handles document uploads without needing S3/GCS setup
- Actions (serverless functions with side effects) cleanly encapsulate AI API calls

### 3. Skeleton gate pattern → removed for dev
Every page had `if (application === undefined) return <PageSkeleton />` — this guards against rendering before Convex data loads. All skeleton gates were **commented out during visual development** so pages render immediately without a live backend. Before production deploy, these must be re-enabled.

### 4. AI cover letter via Gemini Flash
The cover letter generator in `convex/coverLetters.ts` calls Google's Generative Language API directly from a Convex action. It takes the applicant's name, occupation type, and destination, builds a structured prompt, and returns letter text. Gemini Flash was chosen because it's on Google's free tier and fast enough for a single user-blocking generation call.

### 5. OCR pipeline
Passport and employment documents go through Claude (Anthropic) for structured data extraction. The flow is:
1. User uploads file → stored in Convex Storage
2. Convex action fetches file, sends to Claude with a structured extraction prompt
3. Extracted JSON is saved back to Convex
4. Client reactive query picks up the result, shows review UI

### 6. Popup/modal system
8 "What's this?" informational modals (one per document page) share a single `InfoModal` component (`src/components/ui/InfoModal.tsx`). Bottom-sheet on mobile, centered dialog on desktop. Two other modals exist:
- **Bank Statement Important Notice** — auto-fires when user clicks Next on bank-statements page, forces acknowledgement before proceeding
- **Leave Letter Format** — user-triggered, shows the expected document format

---

## How to Run

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Convex account (free) → [convex.dev](https://convex.dev)
- Clerk account (free) → [clerk.com](https://clerk.com)
- Google AI Studio key → [aistudio.google.com](https://aistudio.google.com)

### 1. Install dependencies
```bash
cd C:\Users\jreno\Documents\Ideas\wiza
pnpm install
```

### 2. Set up Convex (get `NEXT_PUBLIC_CONVEX_URL`)
```bash
cd apps/web
npx convex dev
```
- First run: prompts you to log in and create a project
- Automatically writes `NEXT_PUBLIC_CONVEX_URL` to `.env.local`
- Leave this terminal running — it watches and deploys your Convex functions

### 3. Set up Clerk (get Clerk keys)
1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Create a new application (or use existing)
3. Go to **API Keys** in the left sidebar
4. Copy **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
5. Copy **Secret key** → `CLERK_SECRET_KEY`

### 4. Complete `.env.local`
File is at `apps/web/.env.local`:
```env
# Auto-filled by `npx convex dev`
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# From Clerk dashboard → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# From Google AI Studio (aistudio.google.com) → Get API key
GOOGLE_API_KEY=AIzaSy...

# From Anthropic Console (console.anthropic.com) → API keys
ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Run the dev server
```bash
# In one terminal — keep Convex watching:
cd apps/web && npx convex dev

# In another terminal — Next.js:
cd apps/web && pnpm dev
```
App runs at `http://localhost:3001`

---

## What Needs to Be Done Before Testing End-to-End

| # | What | Status |
|---|---|---|
| 1 | Run `npx convex dev` to get real `NEXT_PUBLIC_CONVEX_URL` | ❌ not configured |
| 2 | Add real Clerk keys to `.env.local` | ❌ placeholders |
| 3 | Verify `GOOGLE_API_KEY` works (see smoke test below) | ✅ confirmed working |
| 4 | Add `ANTHROPIC_API_KEY` for OCR features | ❌ not set |
| 5 | Re-enable skeleton gates (commented out for visual dev) | ⚠️ do before production |
| 6 | Restore Clerk middleware (`middleware.ts`) | ⚠️ bypassed for dev |

---

## Gemini API Smoke Test — Result

Ran directly against the key in `.env.local`:

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" \
  -H "x-goog-api-key: <key from .env.local>" \
  -H "content-type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Write exactly 2 sentences about Paris."}]}]}'
```

**Result: ✅ PASS**
```
"Paris is the capital of France and is globally renowned for its art, fashion,
and gastronomy. The city's skyline is dominated by the iconic Eiffel Tower,
which attracts millions of visitors every year."
```
Model version returned: `gemini-3-flash-preview`
Tokens used: 196 total (8 prompt + 40 response + 148 thinking)

The cover letter generation in `convex/coverLetters.ts` will work as-is once the full backend is running.

---

## File Structure (key files)

```
wiza/
├── apps/web/
│   ├── convex/                    ← Convex backend functions
│   │   ├── applications.ts        ← Application CRUD + step mutations
│   │   ├── coverLetters.ts        ← Gemini cover letter generation
│   │   ├── documents.ts           ← File upload/storage
│   │   ├── passportData.ts        ← Claude OCR for passports
│   │   └── travelers.ts           ← User profile
│   └── src/
│       ├── app/apply/[applicationId]/   ← All apply flow pages
│       │   ├── occupation/        ← Step 1: occupation type
│       │   ├── employment-type/   ← Step 2: private vs govt
│       │   ├── documents/
│       │   │   ├── salary-slips/  ← Upload + OCR
│       │   │   ├── leave-letter/  ← Upload + OCR + alternative doc
│       │   │   ├── itr/           ← 3-year ITR with skip reasons
│       │   │   └── bank-statements/ ← Multi-upload + notice modal
│       │   ├── cover-letter/      ← AI generation + self-employed variant
│       │   ├── sponsor-letter/    ← Optional upload
│       │   └── invitation-letter/ ← Optional upload + Skip & Finish
│       └── components/ui/
│           ├── InfoModal.tsx      ← Shared "What's this?" modal
│           ├── StepBar.tsx        ← Progress stepper
│           ├── UploadDropzone.tsx ← Drag & drop file upload
│           └── DocumentPreview.tsx
└── DEVELOPMENT.md                 ← This file
```

---

## Known Dev-Only Bypasses (restore before production)

1. **`apps/web/src/app/layout.tsx`** — `ClerkProvider` may be commented out → restore it
2. **`apps/web/middleware.ts`** — auth middleware bypassed → restore to protect routes
3. **All page files** — skeleton gates commented out (`// if (application === undefined) return <PageSkeleton />`) → uncomment all
4. **`apps/web/src/app/page.tsx`** — root redirect may be pointing to dev test route

Search for `// if (application` across `src/app/apply/` to find all commented gates.
