# Wiza — How It Works

## Stack
- **Frontend**: Next.js 14 (App Router), Tailwind, Clerk auth
- **Backend**: Convex (DB + serverless actions)
- **AI**: Groq (primary) → Gemini (fallback)

---

## AI Model Split

| Task | Primary | Fallback |
|------|---------|----------|
| Passport MRZ OCR | Groq `llama-4-scout-17b-16e-instruct` | Gemini `gemini-2.0-flash-lite` |
| Salary slip OCR | Groq `llama-4-scout-17b-16e-instruct` | Gemini `gemini-2.0-flash-lite` |
| Leave letter / NOC OCR | Groq `llama-4-scout-17b-16e-instruct` | Gemini `gemini-2.0-flash-lite` |
| Bank statement OCR | Groq `llama-4-scout-17b-16e-instruct` | Gemini `gemini-2.0-flash-lite` |
| Resume text extraction | Groq `llama-4-scout-17b-16e-instruct` | Gemini `gemini-2.0-flash-lite` |
| Cover letter generation | Groq `llama-3.3-70b-versatile` | Gemini `gemini-2.0-flash-lite` |
| Approval scoring | Groq `llama-3.3-70b-versatile` | Gemini `gemini-2.0-flash-lite` |

**Fallback logic lives in `convex/lib/ai.ts`** — all callers just use `callVision()` or `callText()`.

**Free tier limits:**
- Groq: 14,400 req/day
- Gemini: 1,500 req/day (only hit if Groq is exhausted)

**Env vars needed (set in Convex dashboard):**
- `GROQ_API_KEY` — primary
- `GOOGLE_API_KEY` — fallback

---

## User Flow

```
Dashboard
  └─ Create Application (destination + travel dates)
        └─ /passport          Upload front + back → Groq MRZ OCR
        └─ /occupation        Pick occupation type
        └─ /documents/salary-slips    Upload up to 3 slips → Groq OCR
        └─ /documents/bank-statements Upload up to 6 → Groq OCR
        └─ /sponsor-letter    Upload sponsor letter → Groq OCR
        └─ /invitation-letter Upload invite → Groq OCR
        └─ /cover-letter      Groq generates letter from all OCR facts
        └─ Dashboard          View score, download letter
```

Score updates after each step via `scoring:computeScore` action.

---

## OCR Pipeline

### Passport (`convex/passports.ts`)
1. User uploads front + back JPEG via `generateUploadUrl`
2. `extractAndVerify` action fetches both images → converts to base64
3. `callVisionOCR` → `callVision([front, back], mrzPrompt)` → Groq → Gemini fallback
4. Parsed JSON → `validateMRZCheckDigits` (ICAO 9303 weights: 7-3-1)
5. `extractBackPageData` → second vision call for father/mother/address
6. Always saves to DB + links to application (even if MRZ invalid — shows raw extract)

**MRZ check digits validated:** passport number, DOB, expiry.

### Documents (`convex/documents.ts`)
Each doc type calls `callVision([image], typeSpecificPrompt)`:
- **Salary slip** → extracts `companyName, designation, companyAddress, employeeName, month`
- **Leave letter** → extracts `nameFound, nameMatches, hasSeal, hasSignature, companyName`
- **Bank statement** → extracts `accountHolderName, closingBalance, coversLast6Months, meetsMinBalance`

Limits enforced: max 3 salary slips, max 6 bank statements.

---

## Cover Letter Generation (`convex/coverLetters.ts`)

1. `getDataForGenerate` (internalQuery) pulls all OCR'd data:
   - Passport: name, nationality, expiry
   - Salary slip: employer, job title, address
   - Bank statement: balance, currency, 6-month coverage
   - Leave letter: company, name match
   - Sponsor/invitation: host details
   - Application: destination, travel dates, visa type
2. Builds **VERIFIED FACTS block** — only includes fields that actually exist
3. Prompt has strict rules: no placeholders, no invented facts, formal British English, 4 paragraphs
4. `callText(prompt)` → Groq `llama-3.3-70b-versatile` → Gemini fallback
5. Optional: user uploads resume → `extractTextFromFile` adds to context

**Quality guarantees (enforced by prompt):**
- No `[Name]` / `[Company]` placeholders
- All facts sourced from actual uploaded docs
- Exact travel dates used if provided
- Correct sign-off with real name

---

## Approval Scoring (`convex/scoring.ts`)

Rule-based score always computed as baseline:

| Signal | Points |
|--------|--------|
| Has passport | +20 |
| Passport MRZ valid | +10 |
| Occupation set | +10 |
| Each salary slip (max 3) | +5 each |
| Each bank statement (max 4) | +3 each |
| Bank meets min balance (₹1.5L) | +10 |
| Has cover letter | +8 |
| Cover letter approved | +5 |
| Baseline | +10 |
| **Cap** | **95** |

AI score (Groq → Gemini) overrides rule score if response is valid 0–100 integer.
Score saved to `applications.approvalScore`, updated on every status change.

---

## Schema (key tables)

```
applications       — destination, status, occupationType, travelDateFrom/To, approvalScore
passportData       — all MRZ fields + fathersName, mothersName, spouseName, address
documents          — type, storageId, extractedData (OCR JSON), month
coverLetters       — content, version, approved, logoStorageId
travelers          — Clerk user reference
```

---

## Env Vars

| Var | Where set | Used for |
|-----|-----------|----------|
| `GROQ_API_KEY` | Convex dashboard | All AI (primary) |
| `GOOGLE_API_KEY` | Convex dashboard | All AI (fallback) |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Frontend → Convex |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | Auth |
| `CLERK_SECRET_KEY` | `.env.local` | Auth server |
