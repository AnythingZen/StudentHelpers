// The only file that names a model. Switch providers with LLM_PROVIDER in
// server/.env: 'zai' (GLM, default — cheap) or 'anthropic' (Claude).
//   smart()  world spawn, deploy quest — runs once, wants quality
//   fast()   diagnosis, grading       — hot path, student is waiting

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { wrapLanguageModel, extractJsonMiddleware, type LanguageModel } from 'ai';

const provider = () => process.env.LLM_PROVIDER ?? 'zai';

// GLM does not honour a json_schema response_format — it answers in prose.
// So: ask for plain JSON mode on the wire and put the schema in the prompt
// ourselves (see jsonSchemaHint).
const zai = (id: string) => wrapLanguageModel({
  model: createOpenAICompatible({
    name: 'zai',
    baseURL: process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4',
    apiKey: process.env.ZAI_API_KEY,
    supportsStructuredOutputs: true,
    // json_object: GLM ignores a json_schema response_format and answers in prose.
    // reasoning_effort low: GLM always thinks and cannot be told not to, but at
    // the default it spent ~70% of its tokens reasoning (218s for one world).
    transformRequestBody: (body) => ({
      ...body,
      reasoning_effort: process.env.GLM_EFFORT ?? 'low',
      ...(body.response_format ? { response_format: { type: 'json_object' } } : {}),
    }),
  })(id),
  middleware: [],   // extractJsonMiddleware buffers the whole stream; json_object mode already returns bare JSON
});

export function smart(): LanguageModel {
  return provider() === 'anthropic' ? anthropic('claude-opus-5') : zai(process.env.MODEL_SMART ?? 'glm-5.3-flash');
}

export function fast(): LanguageModel {
  return provider() === 'anthropic' ? anthropic('claude-sonnet-5') : zai(process.env.MODEL_FAST ?? 'glm-5.3-flash');
}

// Per-call provider options. Anthropic gets effort/structured-output hints;
// the OpenAI-compatible path ignores unknown keys, so this is safe to spread.
export const hotOptions = () =>
  provider() === 'anthropic' ? { providerOptions: { anthropic: { effort: 'low' as const } } } : {};
export const spawnOptions = () =>
  provider() === 'anthropic' ? { providerOptions: { anthropic: { structuredOutputMode: 'auto' as const } } } : {};

export const isAnthropic = () => provider() === 'anthropic';

// Appended to every prompt on GLM so the model knows the exact shape. Anthropic
// gets the schema natively through Output.object, so it returns ''.
export function jsonSchemaHint(schema: z.ZodType): string {
  if (isAnthropic()) return '';
  return `

Respond with ONLY a JSON object (no prose, no markdown) matching this JSON schema:
${JSON.stringify(z.toJSONSchema(schema))}`;
}

// Per-page text. On GLM this is what the model reads; on Anthropic the model
// gets the PDF itself and this is only used to verify citations. Pages with
// no text layer (scans) are OCR'd through ocr.py — the Python venv already
// exists for scrape.py, and rapidocr needs no system install.
export async function pdfToPages(data: Uint8Array): Promise<string[]> {
  const { extractText } = await import('unpdf');
  const { text } = await extractText(Uint8Array.from(data));   // a copy: unpdf rejects a Buffer and detaches what it is given
  const pages = text.map(cleanPage);
  const empty = pages.flatMap((p, i) => (p.length < 20 ? [i + 1] : []));
  if (empty.length && process.env.BRAIN_OCR !== '0') {
    const ocr = await cached(data, () => {
      console.warn(`[brain] ${empty.length}/${pages.length} pages have no text layer — running OCR (~4s/page, cached after)`);
      return ocrPages(data, empty);
    });
    for (const n of empty) pages[n - 1] = cleanPage(ocr[n - 1] ?? '');
  }
  return pages;
}

// OCR is slow; the same worksheet is re-spawned all day. Cache by content hash.
async function cached(data: Uint8Array, run: () => Promise<string[]>): Promise<string[]> {
  const { createHash } = await import('node:crypto');
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const dir = new URL('./.ocr-cache/', import.meta.url);
  const file = new URL(`${createHash('sha1').update(data).digest('hex')}.json`, dir);
  try { return JSON.parse(await readFile(file, 'utf8')); } catch {}
  const pages = await run();
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(pages));
  return pages;
}

async function ocrPages(data: Uint8Array, pageNumbers: number[]): Promise<string[]> {
  const { execFile } = await import('node:child_process');
  const { writeFile, unlink } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const python = process.env.BRAIN_PYTHON ?? path.join(here, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
  const tmp = path.join(tmpdir(), `brain-ocr-${Date.now()}.pdf`);
  await writeFile(tmp, data);
  try {
    const stdout = await new Promise<string>((resolve, reject) =>
      execFile(python, [path.join(here, 'ocr.py'), tmp, pageNumbers.join(',')], { maxBuffer: 64 * 1024 * 1024, timeout: 600_000 },
        (err, out) => (err ? reject(err) : resolve(out))));
    return (JSON.parse(stdout) as { pages: string[] }).pages;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

function cleanPage(page: string): string {
  return page
    .split(/\r?\n/)
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .filter(l => l && !/^(www\.|https?:)/i.test(l) && !/^(page )?\d{1,3}$/i.test(l) && !/^_{3,}$/.test(l))
    .join('\n');
}
