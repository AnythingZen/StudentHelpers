// URL -> { title, text }. Plain fetch first; if the page is a JS shell (React
// SPA, bot wall) hand off to the headless browser in scrape.py. Everything
// after this function is identical regardless of which one ran.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const MAX_CHARS = 300_000;                 // ~75k tokens; Gutenberg novels can be 500k+
const SHELL_THRESHOLD = 2_000;             // less text than this = probably not rendered

export interface Fetched { title: string; text: string; via: 'fetch' | 'browser' }

export async function fetchSource(url: string): Promise<Fetched> {
  const plain = await plainFetch(url).catch(() => null);
  if (plain && plain.text.length >= SHELL_THRESHOLD) return plain;
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
  const python = process.env.BRAIN_PYTHON ?? path.join(here, '.venv', 'Scripts', 'python.exe');
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
