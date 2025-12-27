import { Collection, HashMap, HashSet, none } from "scats";
import { Quiz } from "../src/quiz";
import { TelegramUpdateMessage } from "../src/telegram-types";
import { MenuService } from "../src/menu-service";
import { GameFactory } from "../src/games/game-factory";
import { TrainingMode } from "../src/training";
import { Term } from "../src/quiz-data";
import { SessionQuestion } from "../src/session-question";
import { NullTelegramService } from "./mock/null-telegram-service";
import { NullMetricsService } from "./mock/null-metrics-service";
import { InMemorySessionsRepository } from "./mock/in-memory-sessions-repository";
import { DummySheetsService, TermRow } from "./mock/dummy-sheets-service";

class DeterministicQuestionGenerator {
  createQuestion(terms: Collection<Term>, remainingIds: HashSet<number>) {
    if (remainingIds.isEmpty) {
      return null;
    }
    const remaining = remainingIds.toArray.sort((a, b) => a - b);
    const verbId = remaining[0];
    const remainingSet = remainingIds.removed(verbId);

    const allIds = Collection.fill<number>(terms.length)((index) => index);
    const distractors = allIds.filter((id) => id !== verbId).toArray;
    const selected = new Collection(distractors.slice(0, 3));
    const options = new Collection([verbId]).concat(selected);
    const correctIndex = 0;
    const question = new SessionQuestion(verbId, options, correctIndex, none);

    return {
      question,
      remaining: remainingSet,
    };
  }
}

const createTgTextMessage = (chatId: number, text: string) =>
  TelegramUpdateMessage.fromJson({
    message: {
      chat: { id: chatId },
      text,
    },
  });

const createTgCallback = (
  chatId: number,
  messageId: number,
  data: string,
  callbackId = "cb",
) =>
  TelegramUpdateMessage.fromJson({
    message: {
      chat: { id: chatId },
    },
    callback_query: {
      id: callbackId,
      data,
      message: {
        chat: { id: chatId },
        message_id: messageId,
      },
    },
  });

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

describe("Quiz start", () => {
  let telegramService: NullTelegramService;
  let metricsService: NullMetricsService;
  let sessionsRepository: InMemorySessionsRepository;
  let questionGenerator: DeterministicQuestionGenerator;
  let menuService: MenuService;
  let sheetsService: DummySheetsService;
  let gameFactory: GameFactory;
  let quiz: Quiz;
  let a1Rows: TermRow[];

  beforeEach(() => {
    telegramService = new NullTelegramService();
    metricsService = new NullMetricsService();
    sessionsRepository = new InMemorySessionsRepository();
    questionGenerator = new DeterministicQuestionGenerator() as any;
    menuService = new MenuService(telegramService as any);
    a1Rows = [
      ["αλφα", "alpha"],
      ["βητα", "beta"],
      ["γαμμα", "gamma"],
      ["δελτα", "delta"],
    ];
    sheetsService = new DummySheetsService(
      HashMap.of(["A1", Collection.from(a1Rows)]),
    );
    gameFactory = new GameFactory(
      telegramService as any,
      sessionsRepository as any,
      questionGenerator as any,
      menuService,
      sheetsService,
      metricsService as any,
      "sheet-id",
    );
    quiz = new Quiz(
      telegramService as any,
      sheetsService,
      sessionsRepository as any,
      questionGenerator as any,
      metricsService as any,
      menuService,
      gameFactory,
      "sheet-id",
    );
  });

  it("sends mode keyboard on /start", async () => {

    const update = createTgTextMessage(777, "/start");

    await quiz.handleUpdate(update);

    expect(telegramService.sentMessages.length).toBe(1);
    expect(telegramService.sentMessages[0]).toMatchObject({
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
    const update = createTgCallback(222, 333, "mode:ru-gr", "cb-mode");

    await quiz.handleUpdate(update);

    expect(telegramService.editedMessages.length).toBe(1);
    expect(telegramService.editedMessages[0]).toMatchObject({
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

  it("starts gr-ru choice game and sends first question", async () => {
    const update = createTgCallback(
      999,
      55,
      "level:a1|mode:gr-ru",
      "cb-start",
    );

    await quiz.handleUpdate(update);

    expect(telegramService.sentMessages.length).toBe(1);
    expect(telegramService.sentMessages[0]).toMatchObject({
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

    await quiz.handleUpdate(
      createTgCallback(chatId, 10, "level:a1|mode:gr-ru", "cb-level"),
    );

    expect(telegramService.sentMessages.length).toBe(1);
    const baseEdits = telegramService.editedMessages.length;
    const sessionId = extractSessionId(
      telegramService.sentMessages[0].keyboard,
    );

    await quiz.handleUpdate(
      createTgCallback(
        chatId,
        questionMessageId,
        `s=${sessionId}&a=0`,
        "cb-correct",
      ),
    );

    expect(telegramService.editedMessages.length).toBe(baseEdits + 1);
    expect(
      telegramService.editedMessages[telegramService.editedMessages.length - 1]
        .text,
    ).toContain("✅ Верно");
    expect(telegramService.sentMessages.length).toBe(2);

    const nextSessionId = extractSessionId(
      telegramService.sentMessages[1].keyboard,
    );

    await quiz.handleUpdate(
      createTgCallback(
        chatId,
        questionMessageId,
        `s=${nextSessionId}&a=1`,
        "cb-wrong",
      ),
    );

    expect(telegramService.editedMessages.length).toBe(baseEdits + 2);
    expect(
      telegramService.editedMessages[telegramService.editedMessages.length - 1]
        .text,
    ).toContain("❌ Неверно");
    expect(telegramService.sentMessages.length).toBe(3);
  });
});
