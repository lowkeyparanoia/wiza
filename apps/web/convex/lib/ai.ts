/**
 * Groq-first, Gemini-fallback AI helpers for Convex actions.
 * Text tasks: Groq llama-3.3-70b → Gemini 2.0 flash lite
 * Vision tasks: Groq llama-4-scout → Gemini 2.0 flash lite
 */

// ─── Text generation ──────────────────────────────────────────

export async function callText(prompt: string, maxTokens = 1024, temperature = 0.3): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GOOGLE_API_KEY;

  if (groqKey) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
    });
    if (res.ok) {
      const r = await res.json() as { choices: Array<{ message: { content: string } }> };
      return r.choices[0]?.message.content ?? "";
    }
    // Log Groq failure, fall through to Gemini
    console.warn("Groq text failed:", res.status, await res.text().catch(() => ""));
  }

  if (geminiKey) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature },
        }),
      }
    );
    if (res.ok) {
      const r = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
      return r.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    console.warn("Gemini text fallback also failed:", res.status);
  }

  throw new Error("No text AI service available (GROQ_API_KEY or GOOGLE_API_KEY required)");
}

// ─── Vision / OCR ─────────────────────────────────────────────

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export async function callVision(
  images: ImageInput[],
  prompt: string,
  maxTokens = 1024
): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GOOGLE_API_KEY;

  if (groqKey) {
    const content: unknown[] = [
      ...images.map(img => ({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      })),
      { type: "text", text: prompt },
    ];
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content }],
        temperature: 0,
        max_tokens: maxTokens,
      }),
    });
    if (res.ok) {
      const r = await res.json() as { choices: Array<{ message: { content: string } }> };
      return r.choices?.[0]?.message?.content ?? "";
    }
    console.warn("Groq vision failed:", res.status, await res.text().catch(() => ""));
  }

  if (geminiKey) {
    const parts: unknown[] = [
      ...images.map(img => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
      { text: prompt },
    ];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0, maxOutputTokens: maxTokens },
        }),
      }
    );
    if (res.ok) {
      const r = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
      return r.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    console.warn("Gemini vision fallback also failed:", res.status);
  }

  throw new Error("No vision AI service available (GROQ_API_KEY or GOOGLE_API_KEY required)");
}
