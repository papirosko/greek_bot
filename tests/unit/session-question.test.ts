import { Collection, none, some } from "scats";
import { SessionQuestion } from "../../src/session-question";

describe("SessionQuestion", () => {
  it("creates from json and normalizes types", () => {
    const question = SessionQuestion.fromJson({
      verbId: "2",
      options: ["1", 3, 4],
      correctIndex: "1",
      messageId: "7",
    });

    expect(question.verbId).toBe(2);
    expect(question.options.toArray).toEqual([1, 3, 4]);
    expect(question.correctIndex).toBe(1);
    expect(question.messageId).toEqual(some(7));
    expect(question.promptText).toEqual(none);
    expect(question.questionText).toEqual(none);
    expect(question.answerOptions).toEqual(none);
  });

  it("exposes plain item with optional messageId", () => {
    const question = new SessionQuestion(
      5,
      Collection.of(8, 9, 10),
      2,
      none,
      none,
      none,
      none,
    );

    expect(question.item).toEqual({
      verbId: 5,
      options: [8, 9, 10],
      correctIndex: 2,
      messageId: undefined,
      promptText: undefined,
      questionText: undefined,
      answerOptions: undefined,
    });
  });

  it("copies with partial updates", () => {
    const original = new SessionQuestion(
      1,
      Collection.of(1, 2, 3, 4),
      0,
      none,
      none,
      none,
      none,
    );

    const updated = original.copy({
      options: Collection.of(10, 11, 12, 13),
      correctIndex: 2,
      messageId: some(99),
      promptText: some("fact"),
      questionText: some("question"),
      answerOptions: some(Collection.of("a", "b", "c", "d")),
    });

    expect(updated.verbId).toBe(1);
    expect(updated.options.toArray).toEqual([10, 11, 12, 13]);
    expect(updated.correctIndex).toBe(2);
    expect(updated.messageId).toEqual(some(99));
    expect(updated.promptText).toEqual(some("fact"));
    expect(updated.questionText).toEqual(some("question"));
    expect(updated.answerOptions).toEqual(
      some(Collection.of("a", "b", "c", "d")),
    );
  });
});
