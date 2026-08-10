import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';

/**
 * Lightweight Gemini generateContent for help-center routing / Q&A.
 * Does not touch aiCampaign prompts.
 */
export async function generateGeminiText({
  userId,
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  maxOutputTokens = 1024,
  thinkingBudget = null,
} = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw Object.assign(new Error('Thiếu GEMINI_API_KEY'), { status: 500 });
  }

  const modelName = await resolveAllowedModel(userId, null);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig = {
    temperature,
    maxOutputTokens,
  };
  if (Number.isFinite(thinkingBudget) && thinkingBudget >= 0) {
    generationConfig.thinkingConfig = { thinkingBudget };
  }

  const body = {
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Gemini HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.filter((p) => p?.text && !p.thought)
    ?.map((p) => p.text)
    .join('')
    .trim() || '';

  return { text, modelName, raw: data };
}
