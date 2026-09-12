// URL -> { title, text }. Plain fetch first. If the page came back fine but
// nearly empty (a React shell) AND BRAIN_BROWSER_FALLBACK=1, hand off to the
// headless browser in scrape.py. Off by default: it needs Python + Chromium on
// the deploy box, and it is not something to demo on stage.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const MAX_CHARS = 300_000;                 // ~75k tokens; Gutenberg novels can be 500k+
const SHELL_THRESHOLD = 2_000;             // less text than this = probably not rendered

export interface Fetched { title: string; text: string; via: 'fetch' | 'browser' }

export async function fetchSource(url: string): Promise<Fetched> {
  const plain = await plainFetch(url);            // real HTTP errors throw here, not to the browser
  if (plain.text.length >= SHELL_THRESHOLD) return plain;
  if (process.env.BRAIN_BROWSER_FALLBACK !== '1')
    throw new Error(`${url} returned only ${plain.text.length} chars of text (JS-rendered page?). Paste the text instead.`);
  return browserFetch(url);
}

async function plainFetch(url: string): Promise<Fetched> {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (MasteryGrove)' } });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const body = await res.text();
  const isHtml = (res.headers.get('content-type') ?? '').includes('html') || /<html/i.test(body);
  const title = isHtml ? (body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? url).trim() : url.split('/').pop() ?? url;
  const text = isHtml ? stripHtml(body) : body;
  return { title, text: clip(text), via: 'fetch' };
}

async function browserFetch(url: string): Promise<Fetched> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const venvPython = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
  const python = process.env.BRAIN_PYTHON ?? path.join(here, '.venv', ...venvPython);
  const { stdout } = await run(python, [path.join(here, 'scrape.py'), url], { maxBuffer: 16 * 1024 * 1024, timeout: 90_000 });
  const out = JSON.parse(stdout) as { title: string; text: string };
  return { title: out.title, text: clip(out.text), via: 'browser' };
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function clip(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  console.warn(`[brain] source clipped from ${text.length} to ${MAX_CHARS} chars`);
  return text.slice(0, MAX_CHARS);
}
