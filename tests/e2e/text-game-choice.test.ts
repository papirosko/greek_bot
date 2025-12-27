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
    expect(test.telegramService.sentMessages.length).toBe(1);
    expect(test.telegramService.sentMessages[0]).toMatchObject({
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
    });
  });

  it("edits result and sends next question for correct and wrong answers", async () => {
    const chatId = 444;
    const questionMessageId = 1;

    // Start a session and capture the initial question.
    await test.quiz.handleUpdate(
      test.createTgCallback(chatId, 10, "level:a1|mode:gr-ru", "cb-level"),
    );

    expect(test.telegramService.sentMessages.length).toBe(1);
    const baseEdits = test.telegramService.editedMessages.length;
    const sessionId = extractSessionId(
      test.telegramService.sentMessages[0].keyboard,
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

    expect(test.telegramService.editedMessages.length).toBe(baseEdits + 1);
    expect(
      test.telegramService.editedMessages[
        test.telegramService.editedMessages.length - 1
      ].text,
    ).toContain("✅ Верно");
    expect(test.telegramService.sentMessages.length).toBe(2);

    const nextSessionId = extractSessionId(
      test.telegramService.sentMessages[1].keyboard,
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

    expect(test.telegramService.editedMessages.length).toBe(baseEdits + 2);
    expect(
      test.telegramService.editedMessages[
        test.telegramService.editedMessages.length - 1
      ].text,
    ).toContain("❌ Неверно");
    expect(test.telegramService.sentMessages.length).toBe(3);
  });
});
