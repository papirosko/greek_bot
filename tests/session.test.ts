import { Collection, none, some } from "scats";
import { Session } from "../src/session";
import { SessionQuestion } from "../src/session-question";
import { TrainingMode } from "../src/training";

describe("Session", () => {
  it("creates from json with defaults", () => {
    const session = Session.fromJson({
      sessionId: "s1",
      userId: "10",
      level: "A1",
      mode: TrainingMode.GrRu,
      remainingIds: [1, "2", 3],
      totalAsked: "4",
      correctCount: 2,
      current: {
        verbId: "5",
        options: [5, 6, 7, 8],
        correctIndex: "3",
        messageId: "9",
      },
      expiresAt: "100",
      updatedAt: 200,
    });

    expect(session.sessionId).toBe("s1");
    expect(session.userId).toBe(10);
    expect(session.level).toBe("A1");
    expect(session.mode).toBe(TrainingMode.GrRu);
    expect(session.remainingIds.toArray).toEqual([1, 2, 3]);
    expect(session.totalAsked).toBe(4);
    expect(session.correctCount).toBe(2);
    expect(session.totalCount).toBe(3);
    expect(session.current.isDefined).toBe(true);
    expect(session.expiresAt).toBe(100);
    expect(session.updatedAt).toBe(200);

    const current = session.current.getOrElseThrow(
      () => new Error("Missing current"),
    );
    expect(current.verbId).toBe(5);
    expect(current.options.toArray).toEqual([5, 6, 7, 8]);
    expect(current.correctIndex).toBe(3);
    expect(current.messageId).toEqual(some(9));
  });

  it("exposes item with serialized collections", () => {
    const question = new SessionQuestion(
      3,
      new Collection([1, 2, 3, 4]),
      1,
      none,
    );
    const session = new Session(
      "s2",
      20,
      "B1",
      TrainingMode.RuGr,
      new Collection([4, 5]),
      1,
      1,
      2,
      some(question),
      300,
      400,
    );

    expect(session.item).toEqual({
      sessionId: "s2",
      userId: 20,
      level: "B1",
      mode: TrainingMode.RuGr,
      remainingIds: [4, 5],
      totalAsked: 1,
      correctCount: 1,
      totalCount: 2,
      current: {
        verbId: 3,
        options: [1, 2, 3, 4],
        correctIndex: 1,
        messageId: undefined,
      },
      expiresAt: 300,
      updatedAt: 400,
    });
  });

  it("copies with partial updates", () => {
    const base = new Session(
      "s3",
      30,
      "A2",
      TrainingMode.Write,
      new Collection([1, 2, 3]),
      0,
      0,
      3,
      none,
      500,
      600,
    );

    const updated = base.copy({
      remainingIds: new Collection([2, 3]),
      totalAsked: 1,
      correctCount: 1,
    });

    expect(updated.sessionId).toBe("s3");
    expect(updated.remainingIds.toArray).toEqual([2, 3]);
    expect(updated.totalAsked).toBe(1);
    expect(updated.correctCount).toBe(1);
    expect(updated.current).toEqual(none);
  });
});
