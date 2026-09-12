// Everything drawn over the canvas: bars, toasts, banners, the fox's prompt,
// and speech bubbles pinned in the world for recall and teach trees.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Bars, Confidence } from '../../server/src/contract';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function setBars(b: Bars): void {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  $('bar-xp').style.width = `${Math.min(100, b.xp / 3)}%`;   // XP has no ceiling; the bar is decorative on purpose
  $('val-xp').textContent = String(b.xp);
  $('bar-mastery').style.width = pct(b.mastery);
  $('val-mastery').textContent = pct(b.mastery);
  $('bar-retention').style.width = pct(b.retention);
  $('val-retention').textContent = pct(b.retention);
}

export function toast(text: string, tone: 'good' | 'bad' | '' = '', ms = 3200): void {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = text;
  $('toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

export function banner(text: string, ms = 3500): void {
  const el = $('banner');
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), ms);
}

export function setPrompt(text: string | null): void {
  const el = $('prompt');
  el.hidden = !text;
  if (text) el.textContent = text;
}

/** The fox asks before every choice answer. Keys 1/2/3 so pointer lock never has to release. */
export function askConfidence(): Promise<Confidence> {
  const el = $('fox');
  el.hidden = false;
  return new Promise(resolve => {
    const done = (c: Confidence) => {
      el.hidden = true;
      window.removeEventListener('keydown', onKey, true);
      el.querySelectorAll('button').forEach(b => (b.onclick = null));
      resolve(c);
    };
    const onKey = (e: KeyboardEvent) => {
      const c = ({ Digit1: 'low', Digit2: 'medium', Digit3: 'high' } as const)[e.code as 'Digit1'];
      if (c) { e.preventDefault(); done(c); }
    };
    window.addEventListener('keydown', onKey, true);
    el.querySelectorAll<HTMLButtonElement>('button').forEach(b => (b.onclick = () => done(b.dataset.c as Confidence)));
  });
}

/** A speech bubble pinned above a point in the world. */
export class Bubble {
  private obj: CSS2DObject | null = null;
  constructor(private readonly scene: THREE.Scene) {}

  get open(): boolean { return this.obj !== null; }

  say(at: THREE.Vector3, speaker: string, text: string, ms = 7000): void {
    const el = this.mount(at);
    el.innerHTML = '<div><b></b> <span></span></div>';
    el.querySelector('b')!.textContent = `${speaker}:`;
    el.querySelector('span')!.textContent = text;
    if (ms > 0) setTimeout(() => { if (this.obj?.element === el) this.close(); }, ms);
  }

  /** A bubble with a text box. Resolves with the text, or null if dismissed. */
  ask(at: THREE.Vector3, speaker: string, text: string, placeholder: string): Promise<string | null> {
    const el = this.mount(at);
    el.innerHTML = '<div><b></b> <span></span></div><textarea></textarea><button type="button">Send (Ctrl+Enter)</button><small>Esc to cancel</small>';
    el.querySelector('b')!.textContent = `${speaker}:`;
    el.querySelector('span')!.textContent = text;
    const box = el.querySelector('textarea')!;
    box.placeholder = placeholder;
    setTimeout(() => box.focus(), 30);
    return new Promise(resolve => {
      const finish = (value: string | null) => { box.onkeydown = null; resolve(value); };
      el.querySelector('button')!.onclick = () => { if (box.value.trim()) finish(box.value.trim()); };
      box.onkeydown = e => {
        e.stopPropagation();
        if (e.key === 'Escape') { this.close(); finish(null); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && box.value.trim()) finish(box.value.trim());
      };
    });
  }

  showRubric(hit: string[], missing: string[], reaction: string, speaker: string): void {
    if (!this.obj) return;
    const el = this.obj.element as HTMLDivElement;
    el.innerHTML = '<div><b></b> <span></span></div><ul></ul>';
    el.querySelector('b')!.textContent = `${speaker}:`;
    el.querySelector('span')!.textContent = reaction;
    const ul = el.querySelector('ul')!;
    for (const [items, cls, mark] of [[hit, 'hit', '✓'], [missing, 'miss', '·']] as const) {
      for (const item of items) {
        const li = document.createElement('li');
        li.className = cls;
        li.textContent = `${mark} ${item}`;
        ul.append(li);
      }
    }
    setTimeout(() => { if (this.obj?.element === el) this.close(); }, 9000);
  }

  close(): void {
    if (this.obj) this.scene.remove(this.obj);
    this.obj = null;
  }

  private mount(at: THREE.Vector3): HTMLDivElement {
    this.close();
    const el = document.createElement('div');
    el.className = 'label bubble';
    this.obj = new CSS2DObject(el);
    this.obj.position.copy(at);
    this.scene.add(this.obj);
    return el;
  }
}
