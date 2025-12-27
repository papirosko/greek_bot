import { Collection, some } from "scats";
import { MetricsService } from "./metrics";
import { GoogleSpreadsheetsService } from "./sheets";
import { SessionsRepository } from "./sessions.repository";
import { TelegramKeyboard, TelegramService } from "./telegram";
import { TelegramUpdateMessage } from "./telegram-types";
import { TrainingMode } from "./training";
import { QuestionGenerator } from "./question-generator";
import { MenuService } from "./menu-service";
import { GameFactory } from "./games/game-factory";
import { MetadataSerDe } from "./metadata-serde";

/**
 * Логика тренировки: вопросы, ответы, сессии.
 */
export class Quiz {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly sheetsService: GoogleSpreadsheetsService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly questionGenerator: QuestionGenerator,
    private readonly metricsService: MetricsService,
    private readonly menuService: MenuService,
    private readonly gameFactory: GameFactory,
    private readonly spreadsheetId: string,
  ) {}

  /**
   * Обрабатывает входящее обновление Telegram.
   */
  async handleUpdate(update: TelegramUpdateMessage) {
    return await update.message
      .flatMap((message) => message.chat.map((chat) => chat.id))
      .mapPromise(async (chatId) => {
        await update.message
          .flatMap((message) => message.text)
          .map((text) => text.trim().toLowerCase())
          .mapPromise(async (normalized) => {
            if (
              normalized === "/start" ||
              normalized === "/menu" ||
              normalized === "/end" ||
              normalized === "завершить"
            ) {
              await this.clearActiveSession(chatId);
              await this.handleStart(chatId);
            } else if (!normalized.startsWith("/")) {
              await this.gameFactory
                .forUpdate(update)
                .mapPromise((invocation) =>
                  invocation.kind === "choice"
                    ? invocation.game.invoke(invocation.input)
                    : invocation.game.invoke(invocation.input),
                );
            } else {
              await this.telegramService.sendMessage(
                chatId,
                "Пока поддерживается команда /start.",
              );
            }
          });

        await this.handleCallback(update);
      });
  }

  private buildLevelKeyboard(mode: TrainingMode) {
    return TelegramKeyboard.inline([
      [
        { text: "A1", callback_data: `level:a1|mode:${mode}` },
        { text: "A2", callback_data: `level:a2|mode:${mode}` },
      ],
      [
        { text: "B1", callback_data: `level:b1|mode:${mode}` },
        { text: "B2", callback_data: `level:b2|mode:${mode}` },
      ],
    ]);
  }

  private handleStart(chatId: number) {
    return this.menuService.sendStart(chatId);
  }

  private handleMode(
    chatId: number,
    messageId: number,
    callbackId: string,
    mode: TrainingMode,
  ) {
    return Promise.all([
      this.telegramService.answerCallback(callbackId),
      this.telegramService.editMessageText(
        chatId,
        messageId,
        `Режим: ${this.formatModeLabel(mode)}. Выберите уровень:`,
        this.buildLevelKeyboard(mode),
      ),
    ]);
  }

  private formatModeLabel(mode: TrainingMode) {
    if (mode === TrainingMode.RuGr) {
      return "Перевод (RU → GR)";
    }
    if (mode === TrainingMode.Write) {
      return "Написание (RU → GR)";
    }
    return "Перевод (GR → RU)";
  }

  private async handleLevel(
    chatId: number,
    messageId: number,
    callbackId: string,
    level: string,
    mode: TrainingMode,
  ) {
    await Promise.all([
      this.telegramService.answerCallback(callbackId),
      this.telegramService.editMessageText(
        chatId,
        messageId,
        `Выбран ${this.formatModeLabel(mode)} уровень ${level.toUpperCase()}.`,
      ),
    ]);

    const data = await this.sheetsService.loadDataBase(
      this.spreadsheetId,
      level.toUpperCase(),
    );
    const terms = data.get(mode).toArray;
    if (terms.length < 4) {
      await this.telegramService.sendMessage(
        chatId,
        "Недостаточно глаголов для тренировки.",
      );
      return;
    }

    const ids = Collection.fill<number>(terms.length)((index) => index);
    const session = this.sessionsRepository.createSession(
      chatId,
      level,
      mode,
      ids,
    );
    const questionPack = this.questionGenerator.createQuestion(
      new Collection(terms),
      session.remainingIds.toSet,
    );
    if (!questionPack) {
      await this.telegramService.sendMessage(
        chatId,
        "Не удалось сформировать вопрос.",
      );
      return;
    }

    const updated = session.copy({
      current: some(questionPack.question),
      remainingIds: questionPack.remaining.toCollection,
    });
    await this.sessionsRepository.putSession(updated);
    await this.metricsService.safePutMetric("SessionStart", 1, {
      Mode: updated.mode,
      Level: updated.level.toUpperCase(),
    });
    await this.metricsService.safePutMetric("SessionStartTotal", 1, {});
    await this.gameFactory.forMode(mode).sendQuestion(updated, terms);
  }

  private handleCallback(update: TelegramUpdateMessage) {
    return update.callbackQuery.mapPromise(async (query) => {
      const metadataHandled = await MetadataSerDe.fromUpdate(update).mapPromise(
        async (metadata) => {
          if (metadata.data.startsWith("mode:")) {
            const selectedMode = MetadataSerDe.parseMode(metadata.data);
            await this.handleMode(
              metadata.chatId,
              metadata.messageId,
              metadata.callbackId,
              selectedMode,
            );
            return true;
          }

          const levelMeta = MetadataSerDe.parseLevel(metadata.data);
          if (levelMeta.isDefined) {
            const parsed = levelMeta.getOrElseThrow(
              () => new Error("Missing level metadata"),
            );
            await this.handleLevel(
              metadata.chatId,
              metadata.messageId,
              metadata.callbackId,
              parsed.level,
              parsed.mode,
            );
            return true;
          }

          return false;
        },
      );
      if (metadataHandled.contains(true)) {
        return;
      }

      const invocation = this.gameFactory.forUpdate(update);
      if (invocation.isDefined) {
        await invocation.mapPromise((item) =>
          item.kind === "choice"
            ? item.game.invoke(item.input)
            : item.game.invoke(item.input),
        );
        return;
      }

      await this.telegramService.answerCallback(query.id);
    });
  }

  private async clearActiveSession(userId: number) {
    const activeOption =
      await this.sessionsRepository.getSessionByUserId(userId);
    await activeOption.mapPromise((active) =>
      this.sessionsRepository.deleteSession(active.sessionId),
    );
  }
}
