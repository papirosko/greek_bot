import { Collection } from "scats";
import { ActionType } from "../../src/action";
import { TrainingMode } from "../../src/training";
import { Test } from "../test-context";

describe("Text game answers", () => {
  let test: Test;

  beforeEach(() => {
    test = new Test();
  });

  it("accepts a text answer for write mode and sends the next question", async () => {
    const chatId = 321;

    await test.quiz.handleUpdate(
      test.createTgCallback(chatId, 50, "level:a1|mode:write", "cb-start"),
    );

    expect(test.renderedActions.map((action) => action.item)).toEqual(
      Collection.of(
        {
          type: ActionType.AnswerCallback,
          payload: { callbackId: "cb-start" },
        },
        {
          type: ActionType.UpdateLastMessage,
          payload: {
            chatId,
            messageId: 50,
            action: "renderLevelSelected",
            mode: TrainingMode.Write,
            level: "a1",
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId,
            action: "renderQuestion",
            currentQuestionIndex: 1,
            totalQuestions: 4,
            term: "alpha",
          },
        },
      ),
    );
    const baseActions = test.renderedActions.length;

    await test.quiz.handleUpdate(test.createTgTextMessage(chatId, "αλφα"));

    const answerActions = test.renderedActions
      .map((action) => action.item)
      .slice(baseActions, baseActions + 2);
    expect(answerActions).toEqual(
      Collection.of(
        {
          type: ActionType.UpdateLastMessage,
          payload: {
            chatId,
            messageId: 1,
            action: "renderAnswerResult",
            currentQuestionIndex: 1,
            totalQuestions: 4,
            term: "alpha",
            answerText: "αλφα",
            correctText: "αλφα",
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
            term: "beta",
          },
        },
      ),
    );
  });
});
