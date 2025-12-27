import { Collection, HashSet, none } from "scats";
import type { Term } from "./quiz-data";
import { SessionQuestion } from "./session-question";

/**
 * Создает новый вопрос и обновленный список оставшихся терминов.
 */
export class QuestionGenerator {
  /**
   * Создает новый вопрос и обновленный список оставшихся терминов.
   */
  createQuestion(terms: Collection<Term>, remainingIds: HashSet<number>) {
    if (remainingIds.isEmpty) {
      return null;
    }
    const pickIndex = this.randomInt(remainingIds.size);
    const verbId = remainingIds.toCollection.get(pickIndex);
    const remaining = remainingIds.removed(verbId);

    const allIds = Collection.fill<number>(terms.length)((index) => index);
    const distractors = allIds.filter((id) => id !== verbId);
    const selectedDistractors = this.shuffle(distractors).slice(0, 3);
    const options = this.shuffle(
      Collection.of(verbId).concat(selectedDistractors),
    );
    const correctIndex = options.indexOf(verbId);

    const question = new SessionQuestion(verbId, options, correctIndex, none);

    return { question, remaining };
  }

  private randomInt(max: number) {
    return Math.floor(Math.random() * max);
  }

  private shuffle<T>(items: Collection<T>): Collection<T> {
    const copy = items.toArray.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.randomInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return new Collection(copy);
  }
}
