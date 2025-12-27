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

    expect(test.telegramService.sentMessages.length).toBe(1);
    expect(test.telegramService.sentMessages[0]).toMatchObject({
      chatId,
      text: "Вопрос 1/4\nПереведи: alpha",
    });
    const baseEdits = test.telegramService.editedMessages.length;

    await test.quiz.handleUpdate(test.createTgTextMessage(chatId, "αλφα"));

    expect(test.telegramService.editedMessages.length).toBe(baseEdits + 1);
    expect(
      test.telegramService.editedMessages[
        test.telegramService.editedMessages.length - 1
      ].text,
    ).toContain("✅ Верно");
    expect(
      test.telegramService.editedMessages[
        test.telegramService.editedMessages.length - 1
      ].text,
    ).toContain(
      "Ваш ответ: αλφα",
    );
    expect(
      test.telegramService.editedMessages[
        test.telegramService.editedMessages.length - 1
      ].text,
    ).toContain(
      "Правильный ответ: αλφα",
    );

    expect(test.telegramService.sentMessages.length).toBe(2);
    expect(test.telegramService.sentMessages[1]).toMatchObject({
      chatId,
      text: "Вопрос 2/4\nПереведи: beta",
    });
  });
});
