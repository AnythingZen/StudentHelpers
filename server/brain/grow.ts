// Adding trees to an EXISTING world. Both functions return Tree[] tagged with
// an existing conceptId; C appends them and A lays them out. claude-opus-5 —
// runs once per click, wants quality.

import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import type { World, Tree } from '../../shared/types.js';
import { TreesSchema } from './schemas.js';
import { GROW_PROMPT, QUEST_PROMPT } from './prompts.js';
import { fetchSource } from './source.js';
import { fillTree } from './spawn.js';

// Teacher's Deploy Quest: 5 trees aimed at one misconception.
export async function focusQuest(world: World, misconceptionId: string): Promise<Tree[]> {
  const m = world.misconceptions.find(x => x.id === misconceptionId);
  if (!m) throw new Error(`unknown misconception ${misconceptionId}`);
  const { output } = await generateText({
    model: anthropic('claude-opus-5'),
    prompt: QUEST_PROMPT(world.syllabus, m.label, m.conceptId),
    output: Output.object({ schema: TreesSchema }),
  });
  return output.trees.map(t => fillTree({ ...t, id: `${misconceptionId}-${t.id}`, conceptId: m.conceptId }));
}

// Scraped page / transcript -> trees parked in the grove they belong to.
// The model must choose a conceptId from the world; it cannot invent one.
export async function growFromSource(world: World, urlOrText: string): Promise<Tree[]> {
  const isUrl = /^https?:\/\//i.test(urlOrText);
  const text = isUrl ? (await fetchSource(urlOrText)).text : urlOrText;
  const ids = world.concepts.map(c => c.id);
  const { output } = await generateText({
    model: anthropic('claude-opus-5'),
    system: GROW_PROMPT(world.syllabus, world.concepts),
    prompt: `<document>\n${text}\n</document>`,
    output: Output.object({ schema: TreesSchema }),
  });
  const stamp = Date.now().toString(36);
  return output.trees
    .filter(t => ids.includes(t.conceptId))
    .map(t => fillTree({ ...t, id: `g${stamp}-${t.id}` }));
}
