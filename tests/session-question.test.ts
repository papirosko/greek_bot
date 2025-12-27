import { Collection, none, some } from "scats";
import { SessionQuestion } from "../src/session-question";

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
  });

  it("exposes plain item with optional messageId", () => {
    const question = new SessionQuestion(
      5,
      new Collection([8, 9, 10]),
      2,
      none,
    );

    expect(question.item).toEqual({
      verbId: 5,
      options: [8, 9, 10],
      correctIndex: 2,
      messageId: undefined,
    });
  });

  it("copies with partial updates", () => {
    const original = new SessionQuestion(
      1,
      new Collection([1, 2, 3, 4]),
      0,
      none,
    );

    const updated = original.copy({
      options: new Collection([10, 11, 12, 13]),
      correctIndex: 2,
      messageId: some(99),
    });

    expect(updated.verbId).toBe(1);
    expect(updated.options.toArray).toEqual([10, 11, 12, 13]);
    expect(updated.correctIndex).toBe(2);
    expect(updated.messageId).toEqual(some(99));
  });
});
