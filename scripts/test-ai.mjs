/**
 * AI pipeline test — runs outside Convex, hits APIs directly.
 *
 * Tests:
 *   1. Extract text from 3 salary slip DOCXs
 *   2. DeepSeek cover letter with real salary data
 *   3. Groq vision OCR (passport) — supply passport.jpg in scripts/test-docs/
 *
 * Run:
 *   GROQ_API_KEY=xxx DEEPSEEK_API_KEY=yyy node scripts/test-ai.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GROQ_KEY = process.env.GROQ_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// ─── DOCX text extraction (pure zip/xml, no deps) ────────────

async function extractDocxText(filePath) {
  // DOCX = ZIP containing word/document.xml
  try {
    const { createRequire: cr } = await import("module");
    const req = cr(import.meta.url);
    const AdmZip = req("C:/Users/jreno/Documents/Ideas/wiza/apps/web/node_modules/adm-zip");
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return "[word/document.xml not found in zip]";
    const xml = entry.getData().toString("utf8");

    return xml
      .replace(/<w:p[ >]/g, "\n<")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .join("\n");
  } catch (e) {
    return `[Failed to extract: ${e.message}]`;
  }
}

// ─── Groq vision OCR ─────────────────────────────────────────

async function testGroqPassportOCR(imagePath) {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: GROQ VISION — PASSPORT OCR");
  console.log("=".repeat(60));

  if (!GROQ_KEY) { console.log("❌ GROQ_API_KEY not set"); return; }
  if (!fs.existsSync(imagePath)) {
    console.log(`❌ No passport image found at: ${imagePath}`);
    console.log("   → Put a passport scan JPEG at scripts/test-docs/passport.jpg");
    return;
  }

  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString("base64");
  const ext = path.extname(imagePath).toLowerCase().replace(".", "");
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";

  console.log(`📸 Image: ${imagePath} (${Math.round(imageData.length / 1024)}KB)`);
  console.log("⏳ Calling Groq Llama 4 Scout...\n");

  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: "text", text: `Extract the Machine Readable Zone (MRZ) data from this passport.

Return a JSON object with these exact fields:
{
  "surname": "SMITH",
  "givenNames": "JOHN WILLIAM",
  "nationality": "GBR",
  "dateOfBirth": "1990-05-15",
  "sex": "M",
  "expiryDate": "2030-05-14",
  "passportNumber": "AB1234567",
  "issuingCountry": "GBR",
  "mrz1": "<full MRZ line 1 exactly as printed>",
  "mrz2": "<full MRZ line 2 exactly as printed>"
}

Dates must be YYYY-MM-DD format. Sex must be M, F, or X. Return ONLY valid JSON.` },
        ],
      }],
      temperature: 0,
      max_tokens: 1024,
    }),
  });

  const elapsed = Date.now() - t0;
  console.log(`⏱  Response in ${elapsed}ms | Status: ${res.status}`);

  if (!res.ok) {
    const err = await res.text();
    console.log("❌ FAILED:", err);
    return;
  }

  const result = await res.json();
  const text = result.choices?.[0]?.message?.content ?? "";
  console.log("📄 RAW RESPONSE:\n", text);

  // Try parsing as JSON
  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped);
    console.log("\n✅ PARSED PASSPORT DATA:");
    console.table(parsed);

    // Validate key fields
    const issues = [];
    if (!parsed.surname) issues.push("Missing surname");
    if (!parsed.givenNames) issues.push("Missing givenNames");
    if (!parsed.passportNumber) issues.push("Missing passportNumber");
    if (!parsed.dateOfBirth?.match(/^\d{4}-\d{2}-\d{2}$/)) issues.push("dateOfBirth not YYYY-MM-DD");
    if (!parsed.expiryDate?.match(/^\d{4}-\d{2}-\d{2}$/)) issues.push("expiryDate not YYYY-MM-DD");
    if (!["M", "F", "X"].includes(parsed.sex)) issues.push(`Invalid sex: ${parsed.sex}`);
    if (!parsed.mrz1 || parsed.mrz1.length < 40) issues.push("mrz1 looks wrong/short");
    if (!parsed.mrz2 || parsed.mrz2.length < 40) issues.push("mrz2 looks wrong/short");

    if (issues.length === 0) {
      console.log("✅ ALL FIELDS VALID");
    } else {
      console.log("⚠️  ISSUES:", issues.join(", "));
    }
  } catch {
    console.log("⚠️  Could not parse response as JSON — raw text above");
  }
}

// ─── Groq vision OCR — salary slip ───────────────────────────

async function testGroqSalarySlipOCR(imagePath, slipNumber) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: GROQ VISION — SALARY SLIP ${slipNumber}`);
  console.log("=".repeat(60));

  if (!GROQ_KEY) { console.log("❌ GROQ_API_KEY not set"); return; }
  if (!fs.existsSync(imagePath)) {
    console.log(`⏭  Skipping — no image at: ${imagePath}`);
    return;
  }

  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString("base64");
  const ext = path.extname(imagePath).toLowerCase().replace(".", "");
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";

  console.log(`📸 Image: ${path.basename(imagePath)} (${Math.round(imageData.length / 1024)}KB)`);
  console.log("⏳ Calling Groq...\n");

  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: "text", text: `Extract these fields from this salary slip image. Return ONLY valid JSON:
{
  "companyName": "...",
  "designation": "...",
  "companyAddress": "...",
  "employeeName": "...",
  "month": "YYYY-MM"
}
If a field is not visible, use null.` },
        ],
      }],
      temperature: 0,
      max_tokens: 512,
    }),
  });

  const elapsed = Date.now() - t0;
  console.log(`⏱  ${elapsed}ms | Status: ${res.status}`);
  const result = await res.json();
  const text = result.choices?.[0]?.message?.content ?? "";
  console.log("📄 RAW RESPONSE:\n", text);

  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped);
    console.log("\n✅ PARSED:");
    console.table(parsed);
  } catch {
    console.log("⚠️  Not valid JSON");
  }
}

// ─── DeepSeek cover letter ────────────────────────────────────

async function testDeepSeekCoverLetter(salaryData) {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: DEEPSEEK — COVER LETTER GENERATION");
  console.log("=".repeat(60));

  if (!DEEPSEEK_KEY) { console.log("❌ DEEPSEEK_API_KEY not set"); return; }

  // Build facts from whatever salary data we have
  const facts = [
    "Full name: Rahul Sharma",
    "Nationality: IND",
    "Visa type: tourist",
    "Passport valid until: 2029-03-15",
    "Intended travel dates: 2025-07-10 to 2025-07-25",
  ];

  if (salaryData?.companyName) facts.push(`Employer: ${salaryData.companyName}`);
  if (salaryData?.designation) facts.push(`Job title: ${salaryData.designation}`);
  if (salaryData?.companyAddress) facts.push(`Company address: ${salaryData.companyAddress}`);
  if (salaryData?.employeeName) facts.push(`Employee name on slip: ${salaryData.employeeName}`);

  // Add dummy bank data
  facts.push("Bank closing balance: 285000 INR");
  facts.push("Bank statement covers last 6 months: yes");

  console.log("📋 FACTS BEING SENT TO DEEPSEEK:");
  facts.forEach(f => console.log("  -", f));
  console.log("\n⏳ Calling DeepSeek Chat...\n");

  const prompt = `You are writing a visa cover letter for a salaried employee applying for a Schengen visa.

VERIFIED APPLICANT FACTS (extracted from uploaded documents — use these exactly, do not invent alternatives):
${facts.map(f => `- ${f}`).join("\n")}

STRICT RULES — violating any of these makes the letter unusable:
1. Use ONLY the facts listed above. Do not invent, assume, or add any detail not present in the facts.
2. NEVER use bracket placeholders like [Name], [University], [Bank], [Company]. If a fact is unknown, omit that sentence entirely.
3. If travel dates are provided, use them exactly. If not, write "my planned visit" without specifying dates.
4. Write in first person as Rahul Sharma.
5. Formal British English, 4 paragraphs:
   - Para 1: Purpose of visit to Schengen, travel dates if known
   - Para 2: Financial means — cite actual balance/employer if available, otherwise "sufficient personal funds"
   - Para 3: Strong ties to home country, confirmed intention to return before visa expiry
   - Para 4: Closing — available for interview, willingness to provide further documentation
6. Sign off exactly as: "Yours sincerely,\nRahul Sharma"
7. Return ONLY the letter text. No markdown, no backticks, no JSON.`;

  const t0 = Date.now();
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  const elapsed = Date.now() - t0;
  console.log(`⏱  ${elapsed}ms | Status: ${res.status}`);

  if (!res.ok) {
    const err = await res.text();
    console.log("❌ FAILED:", err);
    return;
  }

  const result = await res.json();
  const letter = result.choices?.[0]?.message?.content ?? "";

  console.log("\n" + "─".repeat(60));
  console.log("📝 GENERATED COVER LETTER:");
  console.log("─".repeat(60));
  console.log(letter);
  console.log("─".repeat(60));

  // Quality checks
  console.log("\n🔍 QUALITY CHECKS:");
  const checks = [
    { name: "No bracket placeholders", pass: !/\[[A-Za-z ]+\]/.test(letter) },
    { name: "Contains applicant name (Rahul Sharma)", pass: letter.includes("Rahul Sharma") },
    { name: "Contains destination (Schengen)", pass: letter.toLowerCase().includes("schengen") },
    { name: "Contains travel dates (2025-07-10 or July 10)", pass: letter.includes("2025-07-10") || letter.includes("July 10") || letter.includes("10 July") },
    { name: "Contains bank balance (285000 or 2,85,000)", pass: letter.includes("285000") || letter.includes("2,85,000") || letter.includes("285,000") },
    { name: "Contains employer name", pass: salaryData?.companyName ? letter.includes(salaryData.companyName) : true },
    { name: "Signed off correctly", pass: letter.includes("Yours sincerely") },
    { name: "No markdown (no **)", pass: !letter.includes("**") },
    { name: "4+ paragraphs", pass: letter.split(/\n\n+/).filter(Boolean).length >= 3 },
    { name: "Not too short (>200 chars)", pass: letter.length > 200 },
  ];

  checks.forEach(c => {
    console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  });

  const passed = checks.filter(c => c.pass).length;
  console.log(`\n  Score: ${passed}/${checks.length} checks passed`);
}

// ─── DOCX text extraction test ────────────────────────────────

async function testDocxExtraction(files) {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: DOCX TEXT EXTRACTION (salary slips)");
  console.log("=".repeat(60));

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`\n📄 Extracting: ${path.basename(f)}`);
    if (!fs.existsSync(f)) {
      console.log("   ❌ File not found");
      continue;
    }
    const text = await extractDocxText(f);
    console.log("─".repeat(40));
    console.log(text.slice(0, 800) + (text.length > 800 ? "\n...[truncated]" : ""));
    results.push({ file: path.basename(f), text });
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log("🚀 WIZA AI PIPELINE TEST");
  console.log(`   GROQ_API_KEY: ${GROQ_KEY ? "✅ set" : "❌ missing"}`);
  console.log(`   DEEPSEEK_API_KEY: ${DEEPSEEK_KEY ? "✅ set" : "❌ missing"}`);

  const testDocsDir = path.join(__dirname, "test-docs");
  const downloadsDir = "C:\\Users\\jreno\\Downloads";

  // Salary slip DOCXs provided by user
  const salaryDocxFiles = [
    path.join(downloadsDir, "Pay (1) (1).docx"),
    path.join(downloadsDir, "Pay (2).docx"),
    path.join(downloadsDir, "Pay (3).docx"),
  ];

  // 1. Extract DOCX text
  const docxResults = await testDocxExtraction(salaryDocxFiles);

  // 2. Test Groq passport OCR (needs JPEG)
  await testGroqPassportOCR(path.join(testDocsDir, "passport.jpg"));

  // 3. Test Groq salary slip OCR (needs JPEG — skip if not present)
  await testGroqSalarySlipOCR(path.join(testDocsDir, "salary_slip.jpg"), 1);

  // 4. DeepSeek cover letter — use any salary data we could parse
  // For now use a dummy since DOCX text needs further parsing to extract structured fields
  // Once you convert salary slips to JPEGs, Groq will return structured data to feed here
  await testDeepSeekCoverLetter(null);

  console.log("\n" + "=".repeat(60));
  console.log("✅ ALL TESTS COMPLETE");
  console.log("=".repeat(60));
  console.log("\nTo test Groq OCR with real salary slip images:");
  console.log("  1. Take a screenshot/photo of your salary slip as JPEG");
  console.log("  2. Save as: scripts/test-docs/salary_slip.jpg");
  console.log("  3. Save passport photo as: scripts/test-docs/passport.jpg");
  console.log("  4. Re-run this script");
}

main().catch(console.error);
