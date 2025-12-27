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
  /**
   * @param telegramService Telegram API client.
   * @param sheetsService Google Sheets data reader.
   * @param sessionsRepository Session persistence repository.
   * @param questionGenerator Question builder with randomized options.
   * @param metricsService CloudWatch metrics client.
   * @param menuService Menu sender for top-level navigation.
   * @param gameFactory Factory for game instances and inputs.
   * @param spreadsheetId Google Sheets spreadsheet id.
   */
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
   * @param update Incoming Telegram update DTO.
   * @returns Promise resolved when the update is handled.
   */
  async handleUpdate(update: TelegramUpdateMessage) {
    // Handle callback queries regardless of message presence.
    await this.handleCallback(update);
    return await update.message
      .flatMap((message) => message.chat.map((chat) => chat.id))
      .mapPromise(async (chatId) => {
        // Normalize message text and route commands or answers.
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
      });
  }

  /**
   * Builds the level selection keyboard for a given mode.
   * @param mode Training mode for callback data.
   * @returns Inline keyboard payload.
   */
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

  /**
   * Sends the main menu to a user.
   * @param chatId Telegram chat id.
   * @returns Promise resolved when the message is sent.
   */
  private handleStart(chatId: number) {
    return this.menuService.sendStart(chatId);
  }

  /**
   * Handles mode selection callbacks.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id to edit.
   * @param callbackId Callback query id.
   * @param mode Selected training mode.
   * @returns Promise resolved when the menu is updated.
   */
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

  /**
   * Formats a human-readable label for a training mode.
   * @param mode Training mode.
   * @returns Localized label.
   */
  private formatModeLabel(mode: TrainingMode) {
    if (mode === TrainingMode.RuGr) {
      return "Перевод (RU → GR)";
    }
    if (mode === TrainingMode.Write) {
      return "Написание (RU → GR)";
    }
    return "Перевод (GR → RU)";
  }

  /**
   * Handles level selection callbacks and starts a session.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id to edit.
   * @param callbackId Callback query id.
   * @param level Selected level.
   * @param mode Selected training mode.
   * @returns Promise resolved when the session is started or aborted.
   */
  private async handleLevel(
    chatId: number,
    messageId: number,
    callbackId: string,
    level: string,
    mode: TrainingMode,
  ) {
    // Acknowledge the callback and update the menu message.
    await Promise.all([
      this.telegramService.answerCallback(callbackId),
      this.telegramService.editMessageText(
        chatId,
        messageId,
        `Выбран ${this.formatModeLabel(mode)} уровень ${level.toUpperCase()}.`,
      ),
    ]);

    // Load terms for the selected level.
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

    // Create a session and persist the first question.
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

    // Persist and emit metrics, then send the first question.
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

  /**
   * Routes callback queries to menu handlers or games.
   * @param update Incoming Telegram update DTO.
   * @returns Promise resolved after routing.
   */
  private handleCallback(update: TelegramUpdateMessage) {
    return update.callbackQuery.mapPromise(async (query) => {
      // Try metadata-based routing for menu actions.
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

          // Parse level selection and route accordingly.
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

      // Route to game handlers or acknowledge the callback.
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

  /**
   * Removes the active session for a user if present.
   * @param userId Telegram user id.
   * @returns Promise resolved when deletion completes.
   */
  private async clearActiveSession(userId: number) {
    // Delete the current active session if it exists.
    const activeOption =
      await this.sessionsRepository.getSessionByUserId(userId);
    await activeOption.mapPromise((active) =>
      this.sessionsRepository.deleteSession(active.sessionId),
    );
  }
}
