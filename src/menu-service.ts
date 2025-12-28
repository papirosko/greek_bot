import { Collection } from "scats";
import {
  Action,
  ActionsRenderer,
  ActionType,
  AnswerCallbackPayload,
  EditMessageTextPayload,
  MenuRenderPayload,
  SendMessagePayload,
  SetKeyboardPayload,
} from "./action";
import { TelegramKeyboard, TelegramService } from "./telegram";
import { TrainingMode } from "./training";
import { WordCategory, WordCategoryService } from "./word-category";

/**
 * Service for rendering and sending the main menu keyboard.
 */
export class MenuService {
  private _actionsRenderer: ActionsRenderer = (action) =>
    this.renderActionImpl(action);
  /**
   * Cached mode selection keyboard.
   */
  private readonly modeKeyboard = TelegramKeyboard.inline([
    [{ text: "Перевод (GR → RU)", callback_data: `mode:${TrainingMode.GrRu}` }],
    [{ text: "Перевод (RU → GR)", callback_data: `mode:${TrainingMode.RuGr}` }],
    [
      {
        text: "Написание (RU → GR)",
        callback_data: `mode:${TrainingMode.Write}`,
      },
    ],
    [
      {
        text: "Тема по тексту (GR → RU)",
        callback_data: `mode:${TrainingMode.TextTopic}`,
      },
    ],
  ]);

  /**
   * @param telegramService Telegram API client.
   */
  constructor(private readonly telegramService: TelegramService) {}

  /**
   * Builds actions to send the mode selection menu to the user.
   * @param chatId Telegram chat id.
   * @returns Collection of renderable actions.
   */
  start(chatId: number) {
    return Collection.of(
      Action.sendTgMessage({
        chatId,
        action: "renderStartMenu",
      }),
    );
  }

  /**
   * Builds actions for selected mode menu update.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id to edit.
   * @param callbackId Callback query id.
   * @param mode Selected training mode.
   * @returns Collection of renderable actions.
   */
  modeSelected(
    chatId: number,
    messageId: number,
    callbackId: string,
    mode: TrainingMode,
  ) {
    return Collection.of(
      Action.answerCallback({ callbackId }),
      Action.updateLastMessage({
        chatId,
        messageId,
        action: "renderModeSelected",
        mode,
      }),
    );
  }

  /**
   * Builds actions for selected word category acknowledgement.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id to edit.
   * @param callbackId Callback query id.
   * @param mode Selected training mode.
   * @param category Selected word category.
   * @returns Collection of renderable actions.
   */
  categorySelected(
    chatId: number,
    messageId: number,
    callbackId: string,
    mode: TrainingMode,
    category: WordCategory,
  ) {
    return Collection.of(
      Action.answerCallback({ callbackId }),
      Action.updateLastMessage({
        chatId,
        messageId,
        action: "renderCategorySelected",
        mode,
        category,
      }),
    );
  }

  /**
   * Builds actions for selected level acknowledgement.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id to edit.
   * @param callbackId Callback query id.
   * @param level Selected level.
   * @param mode Selected training mode.
   * @param category Selected word category.
   * @returns Collection of renderable actions.
   */
  levelSelected(
    chatId: number,
    messageId: number,
    callbackId: string,
    level: string,
    mode: TrainingMode,
    category?: WordCategory,
  ) {
    const payload = {
      chatId,
      messageId,
      action: "renderLevelSelected" as const,
      mode,
      level,
      ...(category ? { category } : {}),
    };
    return Collection.of(
      Action.answerCallback({ callbackId }),
      Action.updateLastMessage(payload),
    );
  }

  /**
   * Builds actions for insufficient terms error.
   * @param chatId Telegram chat id.
   * @returns Collection of renderable actions.
   */
  insufficientTerms(chatId: number) {
    return Collection.of(
      Action.sendTgMessage({
        chatId,
        action: "renderInsufficientTerms",
      }),
    );
  }

  /**
   * Builds actions for question creation failure.
   * @param chatId Telegram chat id.
   * @returns Collection of renderable actions.
   */
  questionBuildFailed(chatId: number) {
    return Collection.of(
      Action.sendTgMessage({
        chatId,
        action: "renderQuestionBuildFailed",
      }),
    );
  }

  /**
   * Builds actions for unsupported command replies.
   * @param chatId Telegram chat id.
   * @returns Collection of renderable actions.
   */
  unsupportedCommand(chatId: number) {
    return Collection.of(
      Action.sendTgMessage({
        chatId,
        action: "renderUnsupportedCommand",
      }),
    );
  }

  /**
   * Renders a single action.
   * @param action Renderable action.
   * @returns Promise resolved when the action is rendered.
   */
  async renderAction(action: Action) {
    await this._actionsRenderer(action);
  }

  /**
   * Overrides the action renderer (useful for tests).
   * @param renderer Custom action renderer.
   */
  set actionsRenderer(renderer: ActionsRenderer) {
    this._actionsRenderer = renderer.bind(this);
  }

  /**
   * Default action rendering implementation.
   * @param action Renderable action.
   * @returns Promise resolved when the action is rendered.
   */
  protected async renderActionImpl(action: Action) {
    if (action.type === ActionType.SendTgMessage) {
      const payload = action.payload as SendMessagePayload;
      const rendered = this.renderMenuPayload(payload as MenuRenderPayload);
      await this.telegramService.sendMessage(
        payload.chatId,
        rendered.text,
        rendered.keyboard,
      );
      return;
    }
    if (action.type === ActionType.UpdateLastMessage) {
      const payload = action.payload as EditMessageTextPayload;
      const rendered = this.renderMenuPayload(payload as MenuRenderPayload);
      await this.telegramService.editMessageText(
        payload.chatId,
        payload.messageId,
        rendered.text,
        rendered.keyboard,
      );
      return;
    }
    if (action.type === ActionType.SetKeyboard) {
      const payload = action.payload as SetKeyboardPayload;
      await this.telegramService.editMessageReplyMarkup(
        payload.chatId,
        payload.messageId,
        payload.keyboard,
      );
      return;
    }
    if (action.type === ActionType.AnswerCallback) {
      const payload = action.payload as AnswerCallbackPayload;
      await this.telegramService.answerCallback(payload.callbackId);
    }
  }

  /**
   * Builds message text and keyboard for menu render payloads.
   * @param payload Menu render payload.
   * @returns Rendered message data.
   */
  private renderMenuPayload(payload: MenuRenderPayload) {
    if (payload.action === "renderStartMenu") {
      return {
        text: "Выберите режим тренировки:",
        keyboard: this.modeKeyboard,
      };
    }
    if (payload.action === "renderModeSelected") {
      if (
        payload.mode === TrainingMode.Write ||
        payload.mode === TrainingMode.TextTopic
      ) {
        return {
          text: `Режим: ${this.formatModeLabel(payload.mode)}. Выберите уровень:`,
          keyboard: this.buildLevelKeyboard(payload.mode),
        };
      }
      return {
        text: `Режим: ${this.formatModeLabel(payload.mode)}. Выберите тип слов:`,
        keyboard: this.buildCategoryKeyboard(payload.mode),
      };
    }
    if (payload.action === "renderCategorySelected") {
      return {
        text: `Тип слов: ${WordCategoryService.formatLabel(payload.category)}. Выберите уровень:`,
        keyboard: this.buildLevelKeyboard(payload.mode, payload.category),
      };
    }
    if (payload.action === "renderLevelSelected") {
      const categoryLabel = payload.category
        ? `${WordCategoryService.formatLabel(payload.category)}, `
        : "";
      return {
        text: `Выбран ${categoryLabel}${this.formatModeLabel(payload.mode)} уровень ${payload.level.toUpperCase()}.`,
      };
    }
    if (payload.action === "renderInsufficientTerms") {
      return { text: "Недостаточно слов для тренировки." };
    }
    if (payload.action === "renderQuestionBuildFailed") {
      return { text: "Не удалось сформировать вопрос." };
    }
    if (payload.action === "renderUnsupportedCommand") {
      return { text: "Пока поддерживается команда /start." };
    }
    return { text: "Не удалось обработать действие." };
  }

  /**
   * Builds the level selection keyboard for a given mode.
   * @param mode Training mode for callback data.
   * @param category Optional word category for callback data.
   * @returns Inline keyboard payload.
   */
  private buildLevelKeyboard(mode: TrainingMode, category?: WordCategory) {
    const categorySuffix = category ? `|category:${category}` : "";
    return TelegramKeyboard.inline([
      [
        { text: "A1", callback_data: `level:a1|mode:${mode}${categorySuffix}` },
        { text: "A2", callback_data: `level:a2|mode:${mode}${categorySuffix}` },
      ],
      [
        { text: "B1", callback_data: `level:b1|mode:${mode}${categorySuffix}` },
        { text: "B2", callback_data: `level:b2|mode:${mode}${categorySuffix}` },
      ],
    ]);
  }

  /**
   * Builds the word category selection keyboard.
   * @param mode Training mode for callback data.
   * @returns Inline keyboard payload.
   */
  private buildCategoryKeyboard(mode: TrainingMode) {
    return TelegramKeyboard.inline([
      [
        {
          text: "Глаголы",
          callback_data: `category:${WordCategory.Verbs}|mode:${mode}`,
        },
      ],
      [
        {
          text: "Существительные",
          callback_data: `category:${WordCategory.Nouns}|mode:${mode}`,
        },
      ],
      [
        {
          text: "Прилагательные",
          callback_data: `category:${WordCategory.Adjectives}|mode:${mode}`,
        },
      ],
      [
        {
          text: "Наречия и предлоги",
          callback_data: `category:${WordCategory.Adverbs}|mode:${mode}`,
        },
      ],
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
    if (mode === TrainingMode.TextTopic) {
      return "Тема по тексту (GR → RU)";
    }
    return "Перевод (GR → RU)";
  }
}
