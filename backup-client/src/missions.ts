// The student's mission panel, the beacon that points at the next thing to do,
// and the reflection that finishes a mission. The server decides what a mission
// is (server/src/progress.ts); this file only draws it.
import type { Tree, World } from '../../server/src/contract';
import type { PlayerProgress } from './net';

type Mission = PlayerProgress['missions'][number];
const ICON: Record<string, string> = { answer: '🎯', recall: '🧠', teach: '💬', focus: '🍎', review: '🌱', reflect: '🪞' };

/** Which tree the beacon should stand on: the nearest tree that advances the first unfinished objective. */
export function beaconTree(world: World<Tree>, me: PlayerProgress, from: { x: number; z: number }): Tree | null {
  const mission = me.missions.find(m => m.conceptId === me.current);
  if (!mission) return null;
  const inGrove = world.trees.filter(t => t.conceptId === mission.conceptId);
  const nearest = (trees: Tree[]) => trees.sort((a, b) =>
    Math.hypot(a.pos[0] - from.x, a.pos[2] - from.z) - Math.hypot(b.pos[0] - from.x, b.pos[2] - from.z))[0] ?? null;
  const notYet = (t: Tree) => t.leitnerBox < 2 || t.state === 'withered';
  for (const o of mission.objectives.filter(x => !x.done)) {
    const base = inGrove.filter(t => t.spawnedFrom === null);
    const pick =
      o.kind === 'answer' ? nearest(base.filter(t => t.kind === 'choice' && notYet(t)))
      : o.kind === 'recall' ? nearest(base.filter(t => t.kind === 'recall' && notYet(t)))
      : o.kind === 'teach' ? nearest(base.filter(t => t.kind === 'teach' && notYet(t)))
      : o.kind === 'focus' ? nearest(inGrove.filter(t => t.spawnedFrom?.startsWith('quest:') && notYet(t)))
      // Missed questions: your sapling up the path if there is one, else the withered tree itself.
      : o.kind === 'review' ? nearest(inGrove.filter(t => t.state === 'sapling')) ?? nearest(base.filter(t => t.state === 'withered' || t.state === 'regrown'))
      : null;
    if (pick) return pick;
  }
  return null;
}

export function renderMissionPanel(el: HTMLElement, me: PlayerProgress, onReflect: (m: Mission) => void): void {
  const index = me.missions.findIndex(m => m.conceptId === me.current);
  const mission = me.missions[index];
  el.replaceChildren();
  const head = document.createElement('div');
  head.className = 'mission-head';
  if (!mission) {
    head.innerHTML = '<span class="eyebrow">All missions complete</span><b>🏆 You finished this world</b>';
    el.append(head);
    return;
  }
  head.innerHTML = '<span class="eyebrow"></span><b></b>';
  head.querySelector('.eyebrow')!.textContent = `Mission ${index + 1} of ${me.total}${mission.level !== me.missions[0]?.level ? ` · ${mission.level}` : ''}`;
  head.querySelector('b')!.textContent = mission.questName;
  const steps = document.createElement('ol');
  steps.className = 'objectives';
  const firstOpen = mission.objectives.find(o => !o.done);
  for (const o of mission.objectives) {
    const li = document.createElement('li');
    li.className = o.done ? 'done' : o === firstOpen ? 'next' : '';
    li.innerHTML = '<i></i><span></span><em></em>';
    li.querySelector('i')!.textContent = o.done ? '✓' : ICON[o.kind] ?? '•';
    li.querySelector('span')!.textContent = o.label;
    li.querySelector('em')!.textContent = o.target > 1 ? `${o.progress}/${o.target}` : '';
    steps.append(li);
  }
  el.append(head, steps);
  if (mission.ready && !mission.complete) {
    const b = document.createElement('button');
    b.className = 'reflect-now';
    b.textContent = '🪞 Reflect & finish mission (R)';
    b.onclick = () => onReflect(mission);
    el.append(b);
  } else {
    const next = me.missions[index + 1];
    const foot = document.createElement('small');
    foot.textContent = next ? `Unlocks: ${next.questName}` : 'Last mission in this world';
    el.append(foot);
  }
  if (me.memoryQuest) {
    const mq = document.createElement('div');
    mq.className = `memory${me.memoryQuest.progress >= me.memoryQuest.target ? ' done' : ''}`;
    mq.textContent = `⚔️ Memory Quest: answer ${me.memoryQuest.target} of last session's questions again · ${me.memoryQuest.progress}/${me.memoryQuest.target}`;
    el.append(mq);
  }
}

const RATINGS = [
  [1, '😵', 'Still confused'],
  [2, '🤔', 'Getting there'],
  [3, '🙂', 'I get it'],
  [4, '🧑‍🏫', 'I could teach it'],
] as const;

/**
 * Metacognition: before moving on, the student judges how well they know it and
 * puts one thing into words. Resolves null if they close it to keep practising.
 */
export function askReflection(mission: Mission): Promise<{ rating: 1 | 2 | 3 | 4; note: string } | null> {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `
    <form class="modal reflect" autocomplete="off">
      <span class="eyebrow">🪞 Before you move on</span>
      <h2></h2>
      <div class="ratings"></div>
      <label>In one sentence — what will you remember? <small>(optional)</small><textarea maxlength="300" placeholder="e.g. multiply the top and bottom by the same number"></textarea></label>
      <div class="row"><button type="button" class="ghost">Keep practising</button><button type="submit" disabled>Finish mission</button></div>
    </form>`;
  wrap.querySelector('h2')!.textContent = `How well do you know ${mission.name.toLowerCase()} now?`;
  let rating: 1 | 2 | 3 | 4 | null = null;
  const submit = wrap.querySelector<HTMLButtonElement>('button[type=submit]')!;
  for (const [value, emoji, label] of RATINGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span>${emoji}</span><b></b><small>${value}</small>`;
    b.querySelector('b')!.textContent = label;
    b.onclick = () => {
      rating = value;
      wrap.querySelectorAll('.ratings button').forEach(x => x.classList.toggle('active', x === b));
      submit.disabled = false;
    };
    wrap.querySelector('.ratings')!.append(b);
  }
  document.body.append(wrap);
  return new Promise(resolve => {
    const done = (v: { rating: 1 | 2 | 3 | 4; note: string } | null) => { wrap.remove(); window.removeEventListener('keydown', keys, true); resolve(v); };
    const keys = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLTextAreaElement) { if (e.key === 'Escape') done(null); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= 4) { e.preventDefault(); (wrap.querySelectorAll<HTMLButtonElement>('.ratings button')[n - 1])!.click(); }
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && rating) { e.preventDefault(); submit.click(); }
    };
    window.addEventListener('keydown', keys, true);
    wrap.querySelector<HTMLButtonElement>('.ghost')!.onclick = () => done(null);
    wrap.querySelector('form')!.onsubmit = e => {
      e.preventDefault();
      if (rating) done({ rating, note: wrap.querySelector('textarea')!.value.trim() });
    };
  });
}

/** Compare the student's own rating with how they actually did — the calibration moment. */
export function judgmentFeedback(rating: number, accuracy: number | null): string {
  if (accuracy === null) return 'Mission complete.';
  const pct = Math.round(accuracy * 100);
  const felt = rating >= 3 ? 'confident' : 'unsure';
  if (rating >= 3 && accuracy >= 0.7) return `You felt ${felt} and got ${pct}% right — you know what you know.`;
  if (rating >= 3 && accuracy < 0.7) return `You felt ${felt}, but got ${pct}% right. Worth a second look before a test.`;
  if (rating <= 2 && accuracy >= 0.7) return `You got ${pct}% right — you know more than you think.`;
  return `${pct}% right, and you knew it was shaky. The Memory Quest will bring these back.`;
}
