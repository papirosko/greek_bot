import { TrainingMode } from "../../src/training";
import { Test } from "../test-context";

describe("Quiz start menu", () => {
  let test: Test;

  beforeEach(() => {
    test = new Test();
  });

  it("sends mode keyboard on /start", async () => {
    const update = test.createTgTextMessage(777, "/start");

    await test.quiz.handleUpdate(update);

    expect(test.telegramService.sentMessages.length).toBe(1);
    expect(test.telegramService.sentMessages[0]).toMatchObject({
      chatId: 777,
      text: "Выберите режим тренировки:",
      keyboard: {
        inline_keyboard: [
          [
            {
              text: "Перевод (GR → RU)",
              callback_data: `mode:${TrainingMode.GrRu}`,
            },
          ],
          [
            {
              text: "Перевод (RU → GR)",
              callback_data: `mode:${TrainingMode.RuGr}`,
            },
          ],
          [
            {
              text: "Написание (RU → GR)",
              callback_data: `mode:${TrainingMode.Write}`,
            },
          ],
        ],
      },
    });
  });

  it("shows level keyboard after mode selection", async () => {
    const update = test.createTgCallback(222, 333, "mode:ru-gr", "cb-mode");

    await test.quiz.handleUpdate(update);

    expect(test.telegramService.editedMessages.length).toBe(1);
    expect(test.telegramService.editedMessages[0]).toMatchObject({
      chatId: 222,
      messageId: 333,
      text: "Режим: Перевод (RU → GR). Выберите уровень:",
      keyboard: {
        inline_keyboard: [
          [
            { text: "A1", callback_data: "level:a1|mode:ru-gr" },
            { text: "A2", callback_data: "level:a2|mode:ru-gr" },
          ],
          [
            { text: "B1", callback_data: "level:b1|mode:ru-gr" },
            { text: "B2", callback_data: "level:b2|mode:ru-gr" },
          ],
        ],
      },
    });
  });
});
