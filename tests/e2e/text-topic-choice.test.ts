import { Collection } from "scats";
import { ActionType } from "../../src/action";
import { TrainingMode } from "../../src/training";
import { Test } from "../test-context";

describe("Text-topic choice game", () => {
  let test: Test;

  beforeEach(() => {
    test = new Test();
  });

  it("starts text-topic session and sends a question", async () => {
    const update = test.createTgCallback(
      555,
      42,
      "level:a1|mode:text-topic",
      "cb-topic",
    );

    await test.quiz.handleUpdate(update);

    expect(test.renderedActions.map((action) => action.item)).toEqual(
      Collection.of(
        {
          type: ActionType.AnswerCallback,
          payload: { callbackId: "cb-topic" },
        },
        {
          type: ActionType.UpdateLastMessage,
          payload: {
            chatId: 555,
            messageId: 42,
            action: "renderLevelSelected",
            mode: TrainingMode.TextTopic,
            level: "a1",
          },
        },
        {
          type: ActionType.SendTgMessage,
          payload: {
            chatId: 555,
            action: "renderQuestion",
            currentQuestionIndex: 1,
            totalQuestions: 4,
            term:
              "Ο Κώστας πηγαίνει στο σούπερ μάρκετ και αγοράζει ψωμί, τυρί και γάλα. Ρωτάει την τιμή και πληρώνει στο ταμείο.",
            options: [
              "покупки в магазине",
              "ужин с другом",
              "ожидание автобуса",
              "прием у врача",
            ],
            sessionId: expect.any(String),
          },
        },
      ),
    );
  });
});
