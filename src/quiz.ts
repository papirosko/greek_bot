import { Collection } from "scats";
import type { VerbRow } from "./sheets";
import type { SessionQuestion } from "./sessions";

const randomInt = (max: number) => Math.floor(Math.random() * max);

const shuffle = <T>(items: T[]): T[] => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const createQuestion = (verbs: VerbRow[], remainingIds: number[]) => {
  if (remainingIds.length === 0) {
    return null;
  }
  const remaining = remainingIds.slice();
  const pickIndex = randomInt(remaining.length);
  const verbId = remaining.splice(pickIndex, 1)[0];

  const allIds = verbs.map((verb) => verb.id);
  const distractors = new Collection(allIds).filter((id) => id !== verbId).toArray;
  const selectedDistractors = shuffle(distractors).slice(0, 3);
  const options = shuffle([verbId, ...selectedDistractors]);
  const correctIndex = options.indexOf(verbId);

  const question: SessionQuestion = {
    verbId,
    options,
    correctIndex,
  };

  return { question, remaining };
};
