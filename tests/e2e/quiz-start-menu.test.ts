import { Collection } from "scats";
import { ActionType } from "../../src/action";
import { TrainingMode } from "../../src/training";
import { WordCategory } from "../../src/word-category";
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

  it("prompts for word category after choice mode selection", async () => {
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

  it("shows level keyboard after category selection", async () => {
    const update = test.createTgCallback(
      222,
      333,
      "category:verbs|mode:ru-gr",
      "cb-category",
    );

    await test.quiz.handleUpdate(update);

    expect(test.renderedActions.map((action) => action.item)).toEqual(
      Collection.of(
        {
          type: ActionType.AnswerCallback,
          payload: {
            callbackId: "cb-category",
          },
        },
        {
          type: ActionType.UpdateLastMessage,
          payload: {
            chatId: 222,
            messageId: 333,
            action: "renderCategorySelected",
            mode: TrainingMode.RuGr,
            category: WordCategory.Verbs,
          },
        },
      ),
    );
  });

  it("accepts adjective and adverb categories", async () => {
    await test.quiz.handleUpdate(
      test.createTgCallback(222, 333, "category:adjectives|mode:ru-gr", "cb-adj"),
    );
    await test.quiz.handleUpdate(
      test.createTgCallback(222, 333, "category:adverbs|mode:ru-gr", "cb-adv"),
    );

    const items = test.renderedActions.map((action) => action.item).toArray;
    expect(items.slice(0, 2)).toEqual([
      {
        type: ActionType.AnswerCallback,
        payload: { callbackId: "cb-adj" },
      },
      {
        type: ActionType.UpdateLastMessage,
        payload: {
          chatId: 222,
          messageId: 333,
          action: "renderCategorySelected",
          mode: TrainingMode.RuGr,
          category: WordCategory.Adjectives,
        },
      },
    ]);
    expect(items.slice(2, 4)).toEqual([
      {
        type: ActionType.AnswerCallback,
        payload: { callbackId: "cb-adv" },
      },
      {
        type: ActionType.UpdateLastMessage,
        payload: {
          chatId: 222,
          messageId: 333,
          action: "renderCategorySelected",
          mode: TrainingMode.RuGr,
          category: WordCategory.Adverbs,
        },
      },
    ]);
  });
});
