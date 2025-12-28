import { Collection } from "scats";
import { ActionType } from "../../src/action";
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

    expect(test.renderedActions.map((action) => action.item)).toEqual(
      Collection.of({
        type: ActionType.SendTgMessage,
        payload: {
          chatId: 777,
          action: "renderStartMenu",
        },
      }),
    );
  });

  it("shows level keyboard after mode selection", async () => {
    const update = test.createTgCallback(222, 333, "mode:ru-gr", "cb-mode");

    await test.quiz.handleUpdate(update);

    expect(test.renderedActions.map((action) => action.item)).toEqual(
      Collection.of(
        {
          type: ActionType.AnswerCallback,
          payload: {
            callbackId: "cb-mode",
          },
        },
        {
          type: ActionType.UpdateLastMessage,
          payload: {
            chatId: 222,
            messageId: 333,
            action: "renderModeSelected",
            mode: TrainingMode.RuGr,
          },
        },
      ),
    );
  });
});
