// The hot path: runs while a student waits. claude-sonnet-5, effort low.
// diagnose() classifies a wrong answer into the WORLD'S misconception enum —
// the model cannot invent a label, which is what makes the heatmap a measurement.

import { generateText, Output } from 'ai';
import type { World, Tree, TreeWithAnswer, Diagnosis, Explanation, Confidence, Calibration } from '../../shared/types.js';
import { DiagnosisSchema, GradeSchema, ExplanationSchema } from './schemas.js';
import { DIAGNOSE_PROMPT, GRADE_PROMPT, EXPLAIN_PROMPT } from './prompts.js';
import { fast, hotOptions } from './llm.js';

const hot = () => ({ model: fast(), ...hotOptions() });

export function calibration(confidence: Confidence | undefined, correct: boolean): Calibration | null {
  if (!confidence) return null;
  if (confidence === 'high' && !correct) return 'overconfident';
  if (confidence === 'low' && correct) return 'underconfident';
  return 'calibrated';
}

export async function diagnose(
  tree: Tree, response: string | number, world: World, confidence?: Confidence,
): Promise<Diagnosis> {
  const t = tree as TreeWithAnswer;
  const concept = world.concepts.find(c => c.id === tree.conceptId);
  const own = world.misconceptions.filter(m => m.conceptId === tree.conceptId);
  const list = (own.length ? own : world.misconceptions).map(m => `  ${m.id}: ${m.label}`).join('\n');
  const correctAnswer = t.kind === 'choice' ? t.choices?.[t.answerIndex ?? -1] : t.answerText;
  const studentAnswer = typeof response === 'number' ? t.choices?.[response] ?? String(response) : response;
  const cal = calibration(confidence, false);

  if (process.env.BRAIN_MOCK === '1') {
    return { misconceptionId: own[0]?.id ?? 'unclassified', confidence: 0.8,
             scaffoldHint: 'What happens to the size of each piece when the denominator gets bigger?', evidence: 'mock' };
  }

  const { output } = await generateText({
    ...hot(),
    system: DIAGNOSE_PROMPT,
    prompt: `Concept: ${concept?.name ?? tree.conceptId}
Question: ${tree.question}
Correct answer: ${correctAnswer}
Student answered: ${studentAnswer}
Student's stated confidence: ${confidence ?? 'unknown'}${cal ? ` (${cal})` : ''}

Misconceptions for this world:
${list}`,
    output: Output.object({ schema: DiagnosisSchema(world.misconceptions.map(m => m.id)) }),
  });
  if (output.confidence < 0.5) output.misconceptionId = 'unclassified';
  return output;
}

export async function gradeRecall(tree: Tree, text: string): Promise<{ correct: boolean; why: string }> {
  const t = tree as TreeWithAnswer;
  if (process.env.BRAIN_MOCK === '1') return { correct: true, why: 'mock' };
  const { output } = await generateText({
    ...hot(),
    system: GRADE_PROMPT,
    prompt: `Question: ${tree.question}\nReference answer: ${t.answerText}\nStudent answer: ${text}`,
    output: Output.object({ schema: GradeSchema }),
  });
  return output;
}

export async function gradeExplanation(tree: Tree, text: string): Promise<Explanation> {
  if (process.env.BRAIN_MOCK === '1') return { passed: true, hit: tree.rubric ?? [], missing: [], encouragement: 'mock' };
  const { output } = await generateText({
    ...hot(),
    system: EXPLAIN_PROMPT,
    prompt: `Task: ${tree.question}\nRubric:\n${(tree.rubric ?? []).map(r => `- ${r}`).join('\n')}\n\nStudent's explanation:\n${text}`,
    output: Output.object({ schema: ExplanationSchema }),
  });
  return output;
}
