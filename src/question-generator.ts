import { Collection, HashSet, none } from "scats";
import type { Term } from "./quiz-data";
import { SessionQuestion } from "./session-question";

/**
 * Creates questions with randomized options.
 */
export class QuestionGenerator {
  /**
   * Creates a question and returns remaining ids.
   * @param terms Collection of available terms.
   * @param remainingIds Remaining term ids.
   * @returns Question pack or null when done.
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

  /**
   * Returns a random integer in the range [0, max).
   * @param max Upper bound (exclusive).
   * @returns Random integer.
   */
  private randomInt(max: number) {
    return Math.floor(Math.random() * max);
  }

  /**
   * Returns a shuffled collection without mutating the input.
   * @param items Items to shuffle.
   * @returns Shuffled collection.
   */
  private shuffle<T>(items: Collection<T>): Collection<T> {
    const copy = items.toArray.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.randomInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return new Collection(copy);
  }
}
