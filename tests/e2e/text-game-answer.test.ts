import { Collection } from "scats";
import { ActionType } from "../../src/action";
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
            text: "Выбран Написание (RU → GR) уровень A1.",
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId,
            text: "Вопрос 1/4\nПереведи: alpha",
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
            text: expect.stringContaining("✅ Верно"),
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId,
            text: "Вопрос 2/4\nПереведи: beta",
          },
        },
      ),
    );
  });
});
