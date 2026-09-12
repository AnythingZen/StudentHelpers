// The only file that names a model. Switch providers with LLM_PROVIDER in
// server/.env: 'zai' (GLM, default — cheap) or 'anthropic' (Claude).
//   smart()  world spawn, deploy quest — runs once, wants quality
//   fast()   diagnosis, grading       — hot path, student is waiting

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

const provider = () => process.env.LLM_PROVIDER ?? 'zai';

const zai = () => createOpenAICompatible({
  name: 'zai',
  baseURL: process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4',
  apiKey: process.env.ZAI_API_KEY,
});

export function smart(): LanguageModel {
  return provider() === 'anthropic' ? anthropic('claude-opus-5') : zai()(process.env.MODEL_SMART ?? 'glm-5.3');
}

export function fast(): LanguageModel {
  return provider() === 'anthropic' ? anthropic('claude-sonnet-5') : zai()(process.env.MODEL_FAST ?? 'glm-5.3-flash');
}

// Per-call provider options. Anthropic gets effort/structured-output hints;
// the OpenAI-compatible path ignores unknown keys, so this is safe to spread.
export const hotOptions = () =>
  provider() === 'anthropic' ? { providerOptions: { anthropic: { effort: 'low' as const } } } : {};
export const spawnOptions = () =>
  provider() === 'anthropic' ? { providerOptions: { anthropic: { structuredOutputMode: 'auto' as const } } } : {};

// Text-only providers cannot read a PDF file part. Extract per page so the
// model can still cite page numbers.
export async function pdfToPages(data: Buffer): Promise<string[]> {
  const { extractText } = await import('unpdf');
  const { text } = await extractText(new Uint8Array(data));
  return text;
}
