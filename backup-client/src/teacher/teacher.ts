// The teacher console: spawn a world, show the room code, and watch the class
// live — a top-down heatmap of the forest, what students are stuck on, and the
// two levers the educator controls: Deploy Quest and Next Session.
import type { Player, Tree, World } from '../../../server/src/contract';
import { api, type StudentRow, type TeacherView } from '../net';
import { computeBounds, groveAt, healthColour, projector, type Grove } from './heatmap';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let room = '';
let view: TeacherView | null = null;
let world: World<Tree> | null = null;
let players: Player[] = [];
let sourceKind: 'pdf' | 'url' | 'text' | 'prompt' = 'pdf';
let hoverId: string | null = null;

function toast(text: string, bad = false): void {
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`;
  el.textContent = text;
  $('toasts').append(el);
  setTimeout(() => el.remove(), 4000);
}

const subjectSel = $<HTMLInputElement>('subject'), levelSel = $<HTMLInputElement>('level'), topicSel = $<HTMLInputElement>('topic');

// ---------------- source tabs ----------------
document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(tab => {
  tab.onclick = () => {
    sourceKind = tab.dataset.kind as typeof sourceKind;
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b === tab));
    document.querySelectorAll<HTMLElement>('.tab-body').forEach(b => (b.hidden = b.dataset.kind !== sourceKind));
  };
});

// ---------------- spawn ----------------
$<HTMLButtonElement>('spawn').onclick = async () => {
  const status = $('spawn-status');
  status.className = 'status';
  const form = new FormData();
  if (!subjectSel.value.trim() || !levelSel.value.trim() || !topicSel.value.trim()) {
    status.className = 'status error'; status.textContent = 'Fill in the subject, level and topic.'; return;
  }
  form.set('subject', subjectSel.value.trim());
  form.set('level', levelSel.value.trim());
  form.set('topic', topicSel.value.trim());
  form.set('sourceKind', sourceKind);
  if (sourceKind === 'pdf') {
    const file = $<HTMLInputElement>('pdf').files?.[0];
    if (!file) { status.className = 'status error'; status.textContent = 'Choose a PDF first.'; return; }
    form.set('pdf', file);
  }
  if (sourceKind === 'url') form.set('url', $<HTMLInputElement>('url').value);
  if (sourceKind === 'text') form.set('text', $<HTMLTextAreaElement>('text').value);

  const button = $<HTMLButtonElement>('spawn');
  button.disabled = true;
  status.textContent = 'Reading your worksheet…';
  try {
    const { worldId } = await api.spawn(form);
    await refreshRooms();
    selectRoom(worldId);
  } catch (err) {
    status.className = 'status error';
    status.textContent = (err as Error).message;
  } finally {
    button.disabled = false;
  }
};

// ---------------- rooms ----------------
const roomSelect = $<HTMLSelectElement>('room-select');
async function refreshRooms(): Promise<void> {
  const { worlds } = await api.worlds();
  const current = roomSelect.value;
  roomSelect.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: '—' }),
    ...worlds.map(w => Object.assign(document.createElement('option'), { value: w.worldId, textContent: `${w.worldId} · ${w.subject}` })),
  );
  roomSelect.value = room || current;
}
roomSelect.onchange = () => { if (roomSelect.value) selectRoom(roomSelect.value); };

function selectRoom(code: string): void {
  room = code;
  roomSelect.value = code;
  history.replaceState(null, '', `?room=${code}`);
  $('room-card').hidden = false;
  $('insight-card').hidden = false;
  $('room-code').textContent = code;
  const link = `${location.origin}/?room=${code}`;
  Object.assign($<HTMLAnchorElement>('join-link'), { href: link, textContent: link.replace(/^https?:\/\//, '') });
  $<HTMLButtonElement>('copy-link').onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast('📋 Student link copied — paste it in your class chat'); }
    catch { toast(`Share this link: ${link}`); }
  };
  void poll();
}

// ---------------- polling ----------------
async function poll(): Promise<void> {
  if (!room) return;
  const code = room;
  try {
    const [t, s, p] = await Promise.all([api.teacher(code), api.state(code), api.presence(code, 'teacher-console')]);
    if (code !== room) return;           // the teacher switched rooms mid-request
    view = t; world = s.world; players = p.players;
    render();
  } catch (err) {
    $('spawn-status').textContent = (err as Error).message;
  }
}
setInterval(() => void poll(), 1500);

// ---------------- render ----------------
function render(): void {
  if (!view || !world) return;
  const status = $('spawn-status');
  if (world.status === 'growing') {
    status.className = 'status';
    status.textContent = `Reading your worksheet… ${world.concepts.length} concepts found, planting ${world.trees.length} trees`;
  } else if (world.status === 'failed') {
    status.className = 'status error';
    status.textContent = 'That world failed to grow. Try "Just a topic" as a fallback.';
  } else if (status.textContent?.startsWith('Reading')) {
    status.textContent = `Ready — ${world.trees.length} trees across ${world.concepts.length} groves.`;
  }

  $('room-subject').textContent = view.subject;
  $('sample-warning').hidden = world.generatedBy !== 'sample' || Boolean(view.notice);
  $('world-notice').hidden = !view.notice;
  $('world-notice').textContent = view.notice ? `ℹ️ ${view.notice}` : '';
  $('class-goal').textContent = `🏰 The class is unlocking ${view.classWorld.goal}`;
  $('class-bar').style.width = `${view.classWorld.percent}%`;
  $('class-count').textContent = `${view.classWorld.mastered} / ${view.classWorld.total} · ${view.classWorld.percent}%`;
  $('seed-note').textContent = view.demoSeeded
    ? 'Class numbers include a seeded demo cohort; every live answer is added on top.'
    : '';

  renderStudents();
  renderWeakest();
  renderMisconceptions();
  renderGroves();
  drawMap();
}

const STATUS: Record<StudentRow['status'], [string, string]> = {
  'not-started': ['Not started', 'grey'],
  'on-track': ['On track', 'green'],
  stuck: ['Stuck', 'red'],
  overconfident: ['Overconfident', 'amber'],
  finished: ['Finished', 'blue'],
};

function renderStudents(): void {
  const rows = view!.students;
  $('student-count').textContent = rows.length ? `${rows.filter(r => r.online).length} online · ${rows.length} joined` : '';
  const list = $('students');
  if (!rows.length) { list.innerHTML = '<li class="empty">Share the code — students appear here as they join.</li>'; return; }
  // Students who need you first.
  const rank = { stuck: 0, overconfident: 1, 'on-track': 2, 'not-started': 3, finished: 4 } as const;
  list.replaceChildren(...[...rows].sort((a, b) => rank[a.status] - rank[b.status] || Number(b.online) - Number(a.online)).map(r => {
    const li = document.createElement('li');
    li.className = `student ${r.status}`;
    li.innerHTML = `
      <div class="top"><span class="dot"></span><b class="name"></b><span class="pill"></span></div>
      <div class="mission-line"></div>
      <div class="meter"><i></i></div>
      <div class="facts"></div>
      <div class="why"></div>`;
    li.querySelector('.dot')!.classList.toggle('on', r.online);
    li.querySelector('.name')!.textContent = r.name;
    const [label, tone] = STATUS[r.status];
    const pill = li.querySelector('.pill')!;
    pill.textContent = label;
    pill.className = `pill ${tone}`;
    li.querySelector('.mission-line')!.textContent = r.currentMission
      ? `Mission ${r.missionsComplete + 1}/${r.missionsTotal} · ${r.currentMission.questName} · ${r.currentMission.done}/${r.currentMission.total} steps`
      : r.missionsComplete === r.missionsTotal ? `All ${r.missionsTotal} missions complete` : '—';
    li.querySelector<HTMLElement>('.meter i')!.style.width = `${Math.round((100 * r.missionsComplete) / Math.max(1, r.missionsTotal))}%`;
    const c = r.calibration;
    const judged = c.calibrated + c.overconfident + c.underconfident;
    li.querySelector('.facts')!.textContent = [
      r.answers ? `${Math.round(r.accuracy * 100)}% right of ${r.answers}` : 'No answers yet',
      judged ? `confidence matched ${Math.round((100 * c.calibrated) / judged)}%` : '',
      c.overconfident ? `${c.overconfident}× sure but wrong` : '',
    ].filter(Boolean).join(' · ');
    const why = li.querySelector<HTMLElement>('.why')!;
    const refl = r.lastReflection;
    why.textContent = r.lastMisconception ? `Last misconception: ${r.lastMisconception}`
      : refl ? `Reflected on ${refl.questName}: ${['', 'still confused', 'getting there', 'gets it', 'could teach it'][refl.rating]}${refl.note ? ` — “${refl.note}”` : ''}`
      : '';
    why.hidden = !why.textContent;
    return li;
  }));
}

function renderWeakest(): void {
  const w = view!.weakest;
  const el = $('weakest');
  if (!w) { el.innerHTML = '<div class="sub">No misconceptions yet — the class is doing well.</div>'; return; }
  const grove = view!.concepts.find(c => c.id === w.conceptId);
  el.innerHTML = '<div class="big"></div><div class="sub"></div>';
  el.querySelector('.big')!.textContent = `${w.count} students: "${w.label}"`;
  el.querySelector('.sub')!.textContent = `in ${grove?.questName ?? 'a grove'} — not a gradebook, a lesson plan.`;
}

function renderMisconceptions(): void {
  const list = $('misconceptions');
  list.replaceChildren(...view!.misconceptions.slice(0, 6).map(m => {
    const li = document.createElement('li');
    const grove = view!.concepts.find(c => c.id === m.conceptId);
    li.innerHTML = '<span class="n"></span><div><div class="label"></div><div class="grove"></div></div><button class="deploy">Deploy quest</button>';
    li.querySelector('.n')!.textContent = String(m.count);
    li.querySelector('.label')!.textContent = m.label;
    li.querySelector('.grove')!.textContent = grove?.questName ?? '';
    const button = li.querySelector<HTMLButtonElement>('.deploy')!;
    button.onclick = async () => {
      button.disabled = true;
      try {
        const { addedTreeIds } = await api.deployQuest(room, m.id);
        toast(addedTreeIds.length
          ? `🌱 ${addedTreeIds.length} focus trees planted near the entrance`
          : 'No trees to add for that misconception');
        void poll();
      } catch (err) { toast((err as Error).message, true); }
      finally { button.disabled = false; }
    };
    return li;
  }));
}

function renderGroves(): void {
  $('groves').replaceChildren(...view!.concepts.map(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td><span class="minibar"><i></i></span></td><td></td><td></td>';
    const cells = tr.querySelectorAll('td');
    cells[0]!.textContent = `${c.locked ? '🔒 ' : ''}${c.questName}`;
    const bar = cells[1]!.querySelector('i')!;
    bar.style.width = `${Math.round(c.health * 100)}%`;
    bar.style.background = healthColour(c.health);
    cells[2]!.textContent = String(c.attempts);
    cells[3]!.textContent = c.attempts ? `${Math.round(c.missRate * 100)}%` : '—';
    return tr;
  }));
}

// ---------------- the map ----------------
const canvas = $<HTMLCanvasElement>('map');
const ctx = canvas.getContext('2d')!;
let lastProjection: ReturnType<typeof projector> | null = null;

function drawMap(): void {
  if (!view || !world) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth, cssH = Math.round(cssW * 1.15);
  if (canvas.width !== Math.round(cssW * dpr)) { canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const groves: Grove[] = view.heatmap;
  const points: Array<[number, number]> = [
    ...groves.flatMap(g => [[g.centre[0] - g.radius, g.centre[1] - g.radius], [g.centre[0] + g.radius, g.centre[1] + g.radius]] as Array<[number, number]>),
    ...world.trees.map(t => [t.pos[0], t.pos[2]] as [number, number]),
    [0, 12],
  ];
  const proj = projector(computeBounds(points, 6), cssW, cssH);
  lastProjection = proj;
  const { toCanvas, scale } = proj;

  // the path
  const [px0, py0] = toCanvas(0, 14), [px1, py1] = toCanvas(0, Math.min(...points.map(p => p[1])));
  ctx.strokeStyle = '#d8c9a3'; ctx.lineWidth = Math.max(6, 4 * scale); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px1, py1); ctx.stroke();

  // groves, coloured by health
  for (const g of groves) {
    const concept = view.concepts.find(c => c.id === g.conceptId);
    const [cx, cy] = toCanvas(g.centre[0], g.centre[1]);
    ctx.beginPath();
    ctx.arc(cx, cy, g.radius * scale, 0, Math.PI * 2);
    ctx.fillStyle = concept?.locked ? 'rgba(120,120,120,.28)' : healthColour(g.health).replace('rgb', 'rgba').replace(')', ', .55)');
    ctx.fill();
    ctx.lineWidth = g.conceptId === hoverId ? 3 : 1.5;
    ctx.setLineDash(concept?.locked ? [5, 4] : []);
    ctx.strokeStyle = concept?.locked ? '#777' : healthColour(g.health);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#1d2a22';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${concept?.locked ? '🔒 ' : ''}${concept?.questName ?? ''}`, cx, cy - g.radius * scale - 6);
  }

  // trees
  for (const t of world.trees) {
    const [x, y] = toCanvas(t.pos[0], t.pos[2]);
    ctx.beginPath();
    ctx.arc(x, y, t.state === 'sapling' ? 3 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = t.state === 'withered' ? '#8a5a3b' : t.state === 'sapling' ? '#8fd46a' : t.leitnerBox >= 2 ? '#e8b923' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  }

  // students, live
  for (const p of players) {
    const [x, y] = toCanvas(p.pos[0], p.pos[2]);
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = p.playerId === 'seed-mia' ? '#e86aa6' : p.seeded ? '#e0a43a' : '#7b5cd6';
    ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'white'; ctx.stroke();
    ctx.fillStyle = '#1d2a22'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(p.name, x + 9, y + 4);
  }
}

canvas.addEventListener('mousemove', e => {
  if (!view || !lastProjection) return;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  hoverId = groveAt(view.heatmap, px, py, lastProjection.toCanvas, lastProjection.scale);
  const tip = $('tooltip');
  if (!hoverId) { tip.hidden = true; drawMap(); return; }
  const c = view.concepts.find(x => x.id === hoverId)!;
  const top = view.misconceptions.find(m => m.conceptId === hoverId);
  tip.innerHTML = '<b></b><div class="h"></div><div class="mis"></div>';
  tip.querySelector('b')!.textContent = `${c.locked ? '🔒 ' : ''}${c.questName}`;
  tip.querySelector('.h')!.textContent = `${c.name} · ${Math.round(c.health * 100)}% mastered`;
  tip.querySelector('.mis')!.textContent = top ? `${top.count} students: ${top.label}` : '';
  tip.style.left = `${Math.min(px + 14, rect.width - 270)}px`;
  tip.style.top = `${py + 14}px`;
  tip.hidden = false;
  drawMap();
});
canvas.addEventListener('mouseleave', () => { hoverId = null; $('tooltip').hidden = true; drawMap(); });
window.addEventListener('resize', drawMap);

// ---------------- next session ----------------
$<HTMLButtonElement>('next-session').onclick = async () => {
  if (!room) return;
  try {
    const r = await api.nextSession(room);
    toast(`⚔️ Memory Quest: ${r.reviewCount} review tree${r.reviewCount === 1 ? '' : 's'} moved to the entrance`);
    void poll();
  } catch (err) { toast((err as Error).message, true); }
};

// ---------------- boot ----------------
void refreshRooms().then(() => {
  const fromUrl = new URLSearchParams(location.search).get('room');
  if (fromUrl) selectRoom(fromUrl.toUpperCase());
}).catch(() => toast("Can't reach the server — is it running on :3001?", true));
