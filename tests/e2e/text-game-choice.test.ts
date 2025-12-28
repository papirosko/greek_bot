import { Collection } from "scats";
import { ActionType } from "../../src/action";
import { Test } from "../test-context";

const extractSessionId = (keyboard?: unknown) => {
  const payload = keyboard as {
    inline_keyboard?: Array<Array<{ callback_data?: string }>>;
  };
  const firstRow = payload?.inline_keyboard?.[0];
  const firstButton = firstRow?.[0];
  const match = firstButton?.callback_data?.match(/^s=([^&]+)&a=\d+$/);
  if (!match) {
    throw new Error("Missing session id in keyboard");
  }
  return match[1];
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
      "level:a1|mode:gr-ru",
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
            text: "Выбран Перевод (GR → RU) уровень A1.",
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId: 999,
            text: "Вопрос 1/4\nПереведи: αλφα",
            keyboard: {
              inline_keyboard: [
                [
                  {
                    text: "alpha",
                    callback_data: expect.stringMatching(/^s=.*&a=0$/),
                  },
                  {
                    text: "beta",
                    callback_data: expect.stringMatching(/^s=.*&a=1$/),
                  },
                ],
                [
                  {
                    text: "gamma",
                    callback_data: expect.stringMatching(/^s=.*&a=2$/),
                  },
                  {
                    text: "delta",
                    callback_data: expect.stringMatching(/^s=.*&a=3$/),
                  },
                ],
              ],
            },
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
      test.createTgCallback(chatId, 10, "level:a1|mode:gr-ru", "cb-level"),
    );

    const baseActions = test.renderedActions.length;
    const sessionId = extractSessionId(
      (test.renderedActions.toArray[2].payload as { keyboard?: unknown })
        .keyboard,
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
            text: expect.stringContaining("✅ Верно"),
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId,
            text: "Вопрос 2/4\nПереведи: βητα",
            keyboard: {
              inline_keyboard: [
                [
                  {
                    text: "beta",
                    callback_data: expect.stringMatching(/^s=.*&a=0$/),
                  },
                  {
                    text: "alpha",
                    callback_data: expect.stringMatching(/^s=.*&a=1$/),
                  },
                ],
                [
                  {
                    text: "gamma",
                    callback_data: expect.stringMatching(/^s=.*&a=2$/),
                  },
                  {
                    text: "delta",
                    callback_data: expect.stringMatching(/^s=.*&a=3$/),
                  },
                ],
              ],
            },
          },
        },
      ),
    );

    const nextSessionId = extractSessionId(
      (
        test.renderedActions.toArray[baseActions + 2].payload as {
          keyboard?: unknown;
        }
      ).keyboard,
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
            text: expect.stringContaining("❌ Неверно"),
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId,
            text: "Вопрос 3/4\nПереведи: γαμμα",
            keyboard: {
              inline_keyboard: [
                [
                  {
                    text: "gamma",
                    callback_data: expect.stringMatching(/^s=.*&a=0$/),
                  },
                  {
                    text: "alpha",
                    callback_data: expect.stringMatching(/^s=.*&a=1$/),
                  },
                ],
                [
                  {
                    text: "beta",
                    callback_data: expect.stringMatching(/^s=.*&a=2$/),
                  },
                  {
                    text: "delta",
                    callback_data: expect.stringMatching(/^s=.*&a=3$/),
                  },
                ],
              ],
            },
          },
        },
      ),
    );
  });
});
