import { ActionType } from "../../src/action";
import { TrainingMode } from "../../src/training";
import { Test } from "../test-context";

describe("Fact quiz flow", () => {
  let test: Test;

  beforeEach(() => {
    test = new Test();
  });

  it("starts session, sends question, and renders answer result", async () => {
    const startUpdate = test.createTgCallback(
      701,
      10,
      "level:a1|mode:fact-quiz",
      "cb-fact",
    );

    await test.quiz.handleUpdate(startUpdate);

    const actions = test.renderedActions.toArray;
    const questionAction = actions.find(
      (action) =>
        action.type === ActionType.SendTgMessage &&
        (action.payload as { action?: string }).action === "renderQuestion",
    );
    expect(questionAction).toBeDefined();

    const payload = questionAction?.payload as {
      sessionId?: string;
      currentQuestionIndex?: number;
      totalQuestions?: number;
    };
    expect(payload.currentQuestionIndex).toBe(1);
    expect(payload.totalQuestions).toBe(2);
    expect(payload.sessionId).toEqual(expect.any(String));

    expect(test.telegramService.editedMessages).toEqual([
      {
        chatId: 701,
        messageId: 10,
        text: "Выбран Факт + вопрос (GR) уровень A1.",
        keyboard: undefined,
      },
    ]);

    expect(test.telegramService.sentMessages.length).toBe(1);
    const questionMessage = test.telegramService.sentMessages[0];
    expect(questionMessage.chatId).toBe(701);
    expect(questionMessage.text).toContain("Вопрос 1/2");
    expect(questionMessage.text).toContain("Η μέρα έχει 24 ώρες.");

    const answerUpdate = test.createTgCallback(
      701,
      1,
      `f=${payload.sessionId}&a=0`,
      "cb-answer",
    );

    await test.quiz.handleUpdate(answerUpdate);

    const answerEdit = test.telegramService.editedMessages[1];
    expect(answerEdit.text).toContain("Вопрос 1/2");
    expect(answerEdit.text).toContain("❌ Неверно");
    expect(answerEdit.text).toContain("Правильный ответ: 24");
  });
});
