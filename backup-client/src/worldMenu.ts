// Top-right of the game: ＋ grows a new world, 🌍 teleports to another one.
// Both are the same flows as the teacher console, reachable without leaving the game.
import { api, type WorldSummary } from './net';

export const SUGGESTED = {
  subjects: ['Mathematics', 'English', 'Science'],
  levels: ['Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'],
  topics: ['Fractions', 'Decimals', 'Percentage', 'Ratio', 'Area and Volume', 'Reading Comprehension', 'Photosynthesis', 'Cycles in Plants and Animals'],
};

const datalist = (id: string, items: string[]) =>
  `<datalist id="${id}">${items.map(i => `<option value="${i}"></option>`).join('')}</datalist>`;

function modal(html: string): { wrap: HTMLDivElement; close: () => void } {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = html;
  document.body.append(wrap);
  document.exitPointerLock();
  const close = () => { wrap.remove(); window.removeEventListener('keydown', esc, true); };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); e.stopPropagation(); };
  window.addEventListener('keydown', esc, true);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.querySelector<HTMLButtonElement>('.close')?.addEventListener('click', close);
  return { wrap, close };
}

/** A short flash and a line of text, then the new world loads. */
export function teleport(code: string, label: string, name: string): void {
  const fx = document.createElement('div');
  fx.className = 'teleport';
  fx.innerHTML = '<div><span>✨</span><b></b><small></small></div>';
  fx.querySelector('b')!.textContent = `Teleporting to ${code}`;
  fx.querySelector('small')!.textContent = label;
  document.body.append(fx);
  const next = new URLSearchParams(location.search);
  next.set('room', code);
  next.set('name', name);
  setTimeout(() => { location.search = next.toString(); }, 1100);
}

export function openWorldList(current: string, name: string): void {
  const { wrap, close } = modal(`
    <div class="modal worlds">
      <button class="close" aria-label="Close">×</button>
      <span class="eyebrow">🌍 Teleport</span>
      <h2>Switch to another world</h2>
      <p class="sub">Each world is one syllabus topic. Your progress in every world is kept.</p>
      <ul class="world-list"><li class="sub">Loading…</li></ul>
      <button class="ghost new">＋ Grow a new world</button>
    </div>`);
  wrap.querySelector<HTMLButtonElement>('.new')!.onclick = () => { close(); openCreateWorld(name); };
  api.worlds().then(({ worlds }) => {
    const list = wrap.querySelector('.world-list')!;
    const ready = worlds.filter(w => w.status === 'ready');
    list.replaceChildren(...ready.map(w => worldRow(w, w.worldId === current, () => { close(); teleport(w.worldId, label(w), name); })));
    if (!ready.length) list.innerHTML = '<li class="sub">No other worlds yet.</li>';
  }).catch(err => { wrap.querySelector('.world-list')!.innerHTML = `<li class="error">${(err as Error).message}</li>`; });
}

const label = (w: WorldSummary) => `${w.level} ${w.subject.split('—')[0]?.replace(w.level, '').trim() ?? ''} · ${w.topic}`;

function worldRow(w: WorldSummary, here: boolean, go: () => void): HTMLLIElement {
  const li = document.createElement('li');
  li.innerHTML = '<b class="code"></b><div><div class="title"></div><small></small></div><button></button>';
  li.querySelector('.code')!.textContent = w.worldId;
  li.querySelector('.title')!.textContent = w.subject;
  li.querySelector('small')!.textContent = `${w.groves} groves · ${w.trees} questions${w.generatedBy === 'sample' ? ' · sample content' : ''}`;
  const b = li.querySelector('button')!;
  b.textContent = here ? 'You are here' : 'Teleport';
  b.disabled = here;
  b.onclick = go;
  return li;
}

export function openCreateWorld(name: string): void {
  const { wrap, close } = modal(`
    <form class="modal create" autocomplete="off">
      <button type="button" class="close" aria-label="Close">×</button>
      <span class="eyebrow">＋ New world</span>
      <h2>Grow a world from anything you're learning</h2>
      <div class="grid3">
        <label>Subject<input name="subject" list="dl-subjects" value="Mathematics" required maxlength="60" /></label>
        <label>Level<input name="level" list="dl-levels" value="Primary 5" required maxlength="40" /></label>
        <label>Topic<input name="topic" list="dl-topics" placeholder="e.g. Decimals" required maxlength="80" /></label>
      </div>
      ${datalist('dl-subjects', SUGGESTED.subjects)}${datalist('dl-levels', SUGGESTED.levels)}${datalist('dl-topics', SUGGESTED.topics)}
      <div class="tabs">
        <button type="button" data-kind="prompt" class="active">✏️ Just the topic</button>
        <button type="button" data-kind="url">🔗 A link</button>
        <button type="button" data-kind="pdf">📄 A PDF</button>
        <button type="button" data-kind="text">📋 Paste text</button>
      </div>
      <div class="tab-body" data-kind="prompt"><small>The AI builds the world from the syllabus topic.</small></div>
      <div class="tab-body" data-kind="url" hidden><input name="url" type="url" placeholder="https://simple.wikipedia.org/wiki/Fraction" /></div>
      <div class="tab-body" data-kind="pdf" hidden><input name="pdf" type="file" accept="application/pdf" /></div>
      <div class="tab-body" data-kind="text" hidden><textarea name="text" placeholder="Paste a lesson or worksheet…"></textarea></div>
      <button type="submit" class="primary">Grow the world</button>
      <p class="status" role="status"></p>
      <small class="sub">Teaching a class? The <a href="/teacher" target="_blank" rel="noopener">teacher console</a> does the same, and tracks every student live.</small>
    </form>`);
  const form = wrap.querySelector('form')!;
  let kind = 'prompt';
  form.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(tab => {
    tab.onclick = () => {
      kind = tab.dataset.kind!;
      form.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b === tab));
      form.querySelectorAll<HTMLElement>('.tab-body').forEach(b => (b.hidden = b.dataset.kind !== kind));
    };
  });
  const status = form.querySelector<HTMLElement>('.status')!;
  form.onsubmit = async e => {
    e.preventDefault();
    const data = new FormData(form);
    const body = new FormData();
    for (const k of ['subject', 'level', 'topic']) body.set(k, String(data.get(k) ?? ''));
    body.set('sourceKind', kind);
    if (kind === 'url') body.set('url', String(data.get('url') ?? ''));
    if (kind === 'text') body.set('text', String(data.get('text') ?? ''));
    if (kind === 'pdf') {
      const file = data.get('pdf');
      if (!(file instanceof File) || !file.size) { status.className = 'status error'; status.textContent = 'Choose a PDF first.'; return; }
      body.set('pdf', file);
    }
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    submit.disabled = true;
    status.className = 'status';
    status.textContent = 'Reading it…';
    try {
      const { worldId } = await api.spawn(body);
      for (;;) {
        const s = await api.state(worldId);
        if (s.status === 'failed') throw new Error('That world failed to grow. Try "Just the topic".');
        if (s.status === 'ready') {
          status.innerHTML = '';
          const done = document.createElement('div');
          done.className = 'ready';
          done.innerHTML = '<b></b><span></span><button type="button" class="primary">✨ Teleport in</button>';
          done.querySelector('b')!.textContent = worldId;
          done.querySelector('span')!.textContent = `${s.world.concepts.length} groves · ${s.world.trees.length} questions — share the code with friends`;
          done.querySelector('button')!.onclick = () => { close(); teleport(worldId, s.world.subject, name); };
          status.append(done);
          submit.hidden = true;
          return;
        }
        status.textContent = `Growing ${worldId}… ${s.world.concepts.length} groves, ${s.world.trees.length} questions so far`;
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (err) {
      status.className = 'status error';
      status.textContent = (err as Error).message;
      submit.disabled = false;
    }
  };
}
