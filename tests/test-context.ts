import { Collection, HashMap, mutable } from "scats";
import { Action } from "../src/action";
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
  private readonly actions = new mutable.ArrayBuffer<Action>();
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
    const collectMenuRenderer = async (action: Action) => {
      this.actions.append(action);
      await (this.menuService as any).renderActionImpl(action);
    };
    this.menuService.actionsRenderer = collectMenuRenderer;
    const collectGameRendererFactory = (game: any) => async (action: Action) => {
      this.actions.append(action);
      await game.renderActionImpl(action);
    };
    this.gameFactory = new GameFactory(
      this.telegramService as any,
      this.sessionsRepository as any,
      this.questionGenerator as any,
      this.menuService,
      this.sheetsService,
      this.metricsService as any,
      "sheet-id",
      collectGameRendererFactory,
    );
    this.quiz = new Quiz(
      this.sessionsRepository as any,
      this.menuService,
      this.gameFactory,
    );
  }

  get renderedActions() {
    return this.actions.toCollection;
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
