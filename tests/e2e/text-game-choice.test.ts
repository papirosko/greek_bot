import { Collection } from "scats";
import { ActionType } from "../../src/action";
import { TrainingMode } from "../../src/training";
import { WordCategory } from "../../src/word-category";
import { Test } from "../test-context";

const extractSessionId = (payload?: { sessionId?: string }) => {
  if (!payload?.sessionId) {
    throw new Error("Missing session id in payload");
  }
  return payload.sessionId;
};

describe("Quiz start game", () => {
  let test: Test;

  beforeEach(() => {
    test = new Test();
  });

  it("starts gr-ru choice game and sends first question", async () => {
    // Trigger level selection and start the session.
    const update = test.createTgCallback(
      999,
      55,
      "level:a1|mode:gr-ru|category:verbs",
      "cb-start",
    );

    await test.quiz.handleUpdate(update);

    // Verify the first question and answer options.
    expect(test.renderedActions.map((action) => action.item)).toEqual(
      Collection.of(
        {
          type: ActionType.AnswerCallback,
          payload: { callbackId: "cb-start" },
        },
        {
          type: ActionType.UpdateLastMessage,
          payload: {
            chatId: 999,
            messageId: 55,
            action: "renderLevelSelected",
            mode: TrainingMode.GrRu,
            level: "a1",
            category: WordCategory.Verbs,
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId: 999,
            action: "renderQuestion",
            currentQuestionIndex: 1,
            totalQuestions: 4,
            term: "αλφα",
            options: ["alpha", "beta", "gamma", "delta"],
            sessionId: expect.any(String),
          },
        },
      ),
    );
  });

  it("edits result and sends next question for correct and wrong answers", async () => {
    const chatId = 444;
    const questionMessageId = 1;

    // Start a session and capture the initial question.
    await test.quiz.handleUpdate(
      test.createTgCallback(
        chatId,
        10,
        "level:a1|mode:gr-ru|category:verbs",
        "cb-level",
      ),
    );

    const baseActions = test.renderedActions.length;
    const sessionId = extractSessionId(
      test.renderedActions.toArray[2].payload as { sessionId?: string },
    );

    // Answer correctly and expect edited result plus next question.
    await test.quiz.handleUpdate(
      test.createTgCallback(
        chatId,
        questionMessageId,
        `s=${sessionId}&a=0`,
        "cb-correct",
      ),
    );

    const firstAnswerActions = test.renderedActions
      .map((action) => action.item)
      .slice(baseActions, baseActions + 3);
    expect(firstAnswerActions).toEqual(
      Collection.of(
        {
          type: ActionType.AnswerCallback,
          payload: { callbackId: "cb-correct" },
        },
        {
          type: ActionType.UpdateLastMessage,
          payload: {
            chatId,
            messageId: questionMessageId,
            action: "renderAnswerResult",
            currentQuestionIndex: 2,
            totalQuestions: 4,
            term: "αλφα",
            answerText: "alpha",
            correctText: "alpha",
            isCorrect: true,
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId,
            action: "renderQuestion",
            currentQuestionIndex: 2,
            totalQuestions: 4,
            term: "βητα",
            options: ["beta", "alpha", "gamma", "delta"],
            sessionId,
          },
        },
      ),
    );

    const nextSessionId = extractSessionId(
      test.renderedActions.toArray[baseActions + 2].payload as {
        sessionId?: string;
      },
    );

    // Answer incorrectly and expect another edit plus next question.
    await test.quiz.handleUpdate(
      test.createTgCallback(
        chatId,
        questionMessageId,
        `s=${nextSessionId}&a=1`,
        "cb-wrong",
      ),
    );

    const secondAnswerActions = test.renderedActions
      .map((action) => action.item)
      .slice(baseActions + 3, baseActions + 6);
    expect(secondAnswerActions).toEqual(
      Collection.of(
        {
          type: ActionType.AnswerCallback,
          payload: { callbackId: "cb-wrong" },
        },
        {
          type: ActionType.UpdateLastMessage,
          payload: {
            chatId,
            messageId: questionMessageId,
            action: "renderAnswerResult",
            currentQuestionIndex: 3,
            totalQuestions: 4,
            term: "βητα",
            answerText: "alpha",
            correctText: "beta",
            isCorrect: false,
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId,
            action: "renderQuestion",
            currentQuestionIndex: 3,
            totalQuestions: 4,
            term: "γαμμα",
            options: ["gamma", "alpha", "beta", "delta"],
            sessionId: nextSessionId,
          },
        },
      ),
    );
  });
});
