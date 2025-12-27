import { Collection, HashMap } from "scats";
import { Quiz } from "../src/quiz";
import { TelegramUpdateMessage } from "../src/telegram-types";
import { MenuService } from "../src/menu-service";
import { GameFactory } from "../src/games/game-factory";
import { TermRow, DummySheetsService } from "./mock/dummy-sheets-service";
import { NullTelegramService } from "./mock/null-telegram-service";
import { NullMetricsService } from "./mock/null-metrics-service";
import { InMemorySessionsRepository } from "./mock/in-memory-sessions-repository";
import { DeterministicQuestionGenerator } from "./mock/deterministic-question-generator";

/**
 * Shared test context for quiz/game suites.
 */
export class Test {
  readonly telegramService = new NullTelegramService();
  readonly metricsService = new NullMetricsService();
  readonly sessionsRepository = new InMemorySessionsRepository();
  readonly questionGenerator = new DeterministicQuestionGenerator() as any;
  readonly menuService = new MenuService(this.telegramService as any);
  readonly sheetsService: DummySheetsService;
  readonly gameFactory: GameFactory;
  readonly quiz: Quiz;

  constructor() {
    const a1Rows: TermRow[] = [
      ["αλφα", "alpha"],
      ["βητα", "beta"],
      ["γαμμα", "gamma"],
      ["δελτα", "delta"],
    ];
    this.sheetsService = new DummySheetsService(
      HashMap.of(["A1", Collection.from(a1Rows)]),
    );
    this.gameFactory = new GameFactory(
      this.telegramService as any,
      this.sessionsRepository as any,
      this.questionGenerator as any,
      this.menuService,
      this.sheetsService,
      this.metricsService as any,
      "sheet-id",
    );
    this.quiz = new Quiz(
      this.telegramService as any,
      this.sheetsService,
      this.sessionsRepository as any,
      this.questionGenerator as any,
      this.metricsService as any,
      this.menuService,
      this.gameFactory,
      "sheet-id",
    );
  }

  createTgTextMessage(chatId: number, text: string) {
    return TelegramUpdateMessage.fromJson({
      message: {
        chat: { id: chatId },
        text,
      },
    });
  }

  createTgCallback(
    chatId: number,
    messageId: number,
    data: string,
    callbackId = "cb",
  ) {
    return TelegramUpdateMessage.fromJson({
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
  }
}
