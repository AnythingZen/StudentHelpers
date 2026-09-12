import type { Tree } from '../../shared/types';

export function showQuestion(tree: Tree, onSubmit: (response: number | string) => void, onClose: () => void) {
  const overlay = document.querySelector<HTMLDivElement>('#question-overlay')!;
  const citation = tree.citation ? `<span class="citation" title="${escape(tree.citation.quote)}">📄 p.${tree.citation.page}</span>` : '';
  const answers = tree.kind === 'choice'
    ? `<div class="choices">${tree.choices!.map((choice, index) => `<button data-answer="${index}"><b>${'ABCD'[index]}</b>${escape(choice)}</button>`).join('')}</div>`
    : `<form><textarea autofocus placeholder="Explain your thinking…"></textarea><button>Plant your answer</button></form>`;
  overlay.innerHTML = `<section class="question-card"><button class="close" aria-label="Close">×</button><div class="eyebrow">QUESTION TREE ${citation}</div><h2>${escape(tree.question)}</h2>${answers}</section>`;
  overlay.classList.add('visible');
  overlay.querySelector('.close')!.addEventListener('click', onClose);
  overlay.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((button) => button.addEventListener('click', () => onSubmit(Number(button.dataset.answer))));
  overlay.querySelector('form')?.addEventListener('submit', (event) => { event.preventDefault(); const text = overlay.querySelector('textarea')!.value; if (text.trim()) onSubmit(text); });
}
export function showHint(hint: string, retry: () => void) {
  const card = document.querySelector<HTMLElement>('.question-card')!;
  card.innerHTML = `<div class="eyebrow">THE TREE WHISPERS</div><h2>${escape(hint)}</h2><p>Follow the new sapling further down the path when you are ready.</p><button class="primary">Continue exploring</button>`;
  card.querySelector('button')!.addEventListener('click', retry);
}
export function closeQuestion() { document.querySelector('#question-overlay')!.classList.remove('visible'); }
const escape = (value: string) => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));
