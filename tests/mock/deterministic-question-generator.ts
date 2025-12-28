import { Collection, HashSet, none } from "scats";
import { SessionQuestion } from "../../src/session-question";

/**
 * Deterministic question generator for stable test expectations.
 */
export class DeterministicQuestionGenerator {
  /**
   * Builds a predictable question pack (first remaining id first).
   * @param terms Collection of terms.
   * @param remainingIds Remaining term ids.
   * @returns Question pack or null when done.
   */
  createQuestion<T>(terms: Collection<T>, remainingIds: HashSet<number>) {
    if (remainingIds.isEmpty) {
      return null;
    }
    const remaining = remainingIds.toArray.sort((a, b) => a - b);
    const verbId = remaining[0];
    const remainingSet = remainingIds.removed(verbId);

    const allIds = Collection.fill<number>(terms.length)((index) => index);
    const distractors = allIds.filter((id) => id !== verbId).toArray;
    const selected = new Collection(distractors.slice(0, 3));
    const options = new Collection([verbId]).concat(selected);
    const correctIndex = 0;
    const question = new SessionQuestion(verbId, options, correctIndex, none);

    return {
      question,
      remaining: remainingSet,
    };
  }
}
