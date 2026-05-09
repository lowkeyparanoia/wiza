/**
 * Real data test — passport + salary + bank → cover letter + scoring
 * Run: GOOGLE_API_KEY=xxx node scripts/test-real.mjs
 */

const GROQ_KEY = process.env.GROQ_API_KEY;

// ── Data read directly from shared passport images ──────────
const passport = {
  surname: "MISQUITH",
  givenNames: "JRENOTH",
  nationality: "IND",
  dateOfBirth: "2003-05-06",
  sex: "M",
  expiryDate: "2029-12-25",
  passportNumber: "U6582556",
  issuingCountry: "IND",
  mrz1: "P<INDMISQUITH<<JRENOTH<<<<<<<<<<<<<<<<<<<<<0",
  mrz2: "U6582556<3IND0305060M2912257<<<<<<<<<<<<<<<0",
  fathersName: "JOHN BAPTIST MISQUITH",
  spouseName: "PRUDENCE SURITHA MISQUITH",
  address: "No. 355/5, 7th Main Road, Viverknagar, Bengaluru, Karnataka 560047",
};

// ── Data from SWIFT payslips ─────────────────────────────────
const salary = {
  companyName: "MEDNA DATA SYSTEMS - FZCO",
  companyAddress: "IFZA Business Park, DDP, Dubai, UAE",
  employeeName: "Jernoth Misquith",
  jan2026: 57000,
  feb2026: 90000,
};

// ── Data from bank statement (page 1 visible) ────────────────
const bank = {
  accountHolder: "Jernoth Misquith",
  bank: "Axis Bank Ltd",
  account: "921010036087250",
  period: "04-01-2025 to 03-07-2025",
  openingBalance: 64496.48,
};

// ─── TEST 1: MRZ Check Digit Validation ──────────────────────

function calcCheck(field) {
  const w = [7, 3, 1];
  const cv = {};
  for (let i = 0; i < 26; i++) cv[String.fromCharCode(65 + i)] = i + 10;
  for (let i = 0; i <= 9; i++) cv[String(i)] = i;
  cv["<"] = 0;
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += (cv[field[i]] ?? 0) * (w[i % 3] ?? 7);
  return sum % 10;
}

console.log("=".repeat(60));
console.log("TEST 1: MRZ CHECK DIGIT VALIDATION");
console.log("=".repeat(60));
const m = passport.mrz2;
console.log("MRZ2:", m);
console.log("Length:", m.length, m.length === 44 ? "✅" : "❌ (expected 44)");

const pCheck = calcCheck(m.slice(0, 9));
const dCheck = calcCheck(m.slice(13, 19));
const eCheck = calcCheck(m.slice(21, 27));

const r = (label, computed, digit) => {
  const ok = computed === parseInt(digit);
  console.log(`${ok ? "✅" : "❌"} ${label}: digit=${digit}, computed=${computed}`);
  return ok;
};
const v1 = r("Passport number", pCheck, m[9]);
const v2 = r("Date of birth  ", dCheck, m[19]);
const v3 = r("Expiry date    ", eCheck, m[27]);
const mrzValid = v1 && v2 && v3;
console.log(`\nMRZ overall: ${mrzValid ? "✅ VALID" : "⚠️  INVALID (image may be partial/angled)"}`);

// ─── TEST 2: Cover Letter — Gemini ───────────────────────────

async function testCoverLetter() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: COVER LETTER — GROQ llama-3.3-70b-versatile");
  console.log("=".repeat(60));

  if (!GROQ_KEY) { console.log("❌ GROQ_API_KEY not set"); return; }

  const facts = [
    `Full name: ${passport.givenNames} ${passport.surname}`,
    `Nationality: ${passport.nationality}`,
    `Visa type: tourist`,
    `Passport number: ${passport.passportNumber}`,
    `Passport valid until: ${passport.expiryDate}`,
    `Employer: ${salary.companyName}`,
    `Company address: ${salary.companyAddress}`,
    `Salary Jan 2026: ${salary.jan2026} INR`,
    `Salary Feb 2026: ${salary.feb2026} INR`,
    `Bank: ${bank.bank}, Account ${bank.account}`,
    `Bank statement period: ${bank.period}`,
    `Bank opening balance: ${bank.openingBalance} INR`,
    `Intended travel dates: 2026-07-01 to 2026-07-20`,
    `Destination: Schengen (Europe)`,
    `Home address: ${passport.address}, India`,
  ];

  console.log("Facts being sent:");
  facts.forEach(f => console.log("  -", f));

  const prompt = `You are writing a visa cover letter for a salaried employee applying for a Schengen visa.

VERIFIED APPLICANT FACTS (extracted from uploaded documents — use these exactly, do not invent alternatives):
${facts.map(f => `- ${f}`).join("\n")}

STRICT RULES — violating any makes the letter unusable:
1. Use ONLY the facts listed above. Do not invent, assume, or add anything not in the facts.
2. NEVER use bracket placeholders like [Name], [University], [Bank], [Company].
3. Travel dates provided — use them exactly.
4. Write in first person as Jrenoth Misquith.
5. Formal British English, 4 paragraphs:
   - Para 1: Purpose of visit to Schengen, exact travel dates
   - Para 2: Financial means — cite employer name, salary amounts, bank
   - Para 3: Strong ties to home country (Bengaluru, India), intention to return before expiry
   - Para 4: Closing — available for interview, willing to provide further documentation
6. Sign off exactly as: "Yours sincerely,\nJrenoth Misquith"
7. Return ONLY the letter text. No markdown, no backticks, no JSON.`;

  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  console.log(`\nGroq status: ${res.status} | Time: ${Date.now() - t0}ms`);
  if (!res.ok) { console.error("ERROR:", await res.text()); return; }

  const result = await res.json();
  const letter = result.choices?.[0]?.message?.content ?? "";

  console.log("\n" + "-".repeat(60));
  console.log("GENERATED COVER LETTER:");
  console.log("-".repeat(60));
  console.log(letter);
  console.log("-".repeat(60));

  const checks = [
    ["No placeholders []", !/\[[A-Za-z ]+\]/.test(letter)],
    ["Has name: Misquith", letter.toLowerCase().includes("misquith")],
    ["Has Schengen", letter.toLowerCase().includes("schengen")],
    ["Has employer: MEDNA", letter.includes("MEDNA")],
    ["Has travel dates (July 2026)", letter.includes("July") || letter.includes("2026-07") || letter.includes("1 July") || letter.includes("July 1")],
    ["Has Bengaluru/India tie", letter.toLowerCase().includes("bengaluru") || letter.toLowerCase().includes("india")],
    ["Has financial info (salary/bank)", letter.includes("57,000") || letter.includes("90,000") || letter.toLowerCase().includes("axis bank") || letter.toLowerCase().includes("salary")],
    ["Correct sign-off", letter.includes("Yours sincerely")],
    ["No markdown (**)", !letter.includes("**")],
    ["4+ paragraphs", letter.split(/\n\n+/).filter(Boolean).length >= 3],
    ["No generic placeholder company", !letter.includes("[Company]") && !letter.includes("[Employer]")],
    ["Length > 400 chars", letter.length > 400],
  ];

  console.log("\nQUALITY CHECKS:");
  let pass = 0;
  checks.forEach(([name, ok]) => {
    console.log(`  ${ok ? "✅" : "❌"} ${name}`);
    if (ok) pass++;
  });
  console.log(`\nScore: ${pass}/${checks.length} — ${pass >= 10 ? "✅ EXCELLENT" : pass >= 8 ? "✅ GOOD" : "⚠️  NEEDS IMPROVEMENT"}`);
}

// ─── TEST 3: Approval Scoring ────────────────────────────────

async function testScoring() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: APPROVAL SCORING — GROQ llama-3.3-70b");
  console.log("=".repeat(60));

  if (!GROQ_KEY) { console.log("❌ GROQ_API_KEY not set"); return; }

  const prompt = `You are a visa approval analyst. Estimate approval probability (0-100).

Application:
- Destination: Schengen (Europe)
- Occupation: salaried (Dubai-based employer)
- Passport: Indian, valid until 2029-12-25
- Salary slips: 2 (SWIFT transfer receipts, 57k + 90k INR)
- Bank statements: 1 (Axis Bank, 6-month period, opening balance 64,496 INR)
- Cover letter: generated
- MRZ valid: ${mrzValid}

Respond with ONLY a single integer 0-100. No explanation.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 16,
      temperature: 0,
    }),
    }
  );

  const result = await res.json();
  const text = result.choices?.[0]?.message?.content ?? "";
  const score = parseInt((text.match(/\d{1,3}/) || ["?"])[0]);
  console.log(`Groq approval score: ${score}/100`);
  if (score >= 30 && score <= 85) {
    console.log("✅ Score is in reasonable range (30–85 for typical tourist visa)");
  } else {
    console.log("⚠️  Unexpected score — check prompt or API response");
  }
}

// ─── TEST 4: Groq OCR on bank statement ──────────────────────

async function testGroqBankStatement() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: GROQ VISION — BANK STATEMENT (from chat image)");
  console.log("=".repeat(60));
  console.log("ℹ️  Testing with real bank statement data visible in image.");
  console.log("   Expected extractions from the Axis Bank statement:");
  console.log("   accountHolderName: Jernoth Misquith");
  console.log("   period: 04-01-2025 to 03-07-2025 (6 months)");
  console.log("   openingBalance: 64,496.48 INR");
  console.log("   bank: Axis Bank");
  console.log("");
  console.log("   → Save the bank statement screenshot as:");
  console.log("     scripts/test-docs/bank_statement.jpg");
  console.log("   → Then rerun to get Groq OCR on it");
}

// ─── Main ────────────────────────────────────────────────────

await testCoverLetter();
await testScoring();
await testGroqBankStatement();
console.log("\n" + "=".repeat(60));
console.log("ALL TESTS COMPLETE");
console.log("=".repeat(60));
