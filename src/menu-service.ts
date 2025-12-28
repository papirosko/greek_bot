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
   * Builds actions for selected level acknowledgement.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id to edit.
   * @param callbackId Callback query id.
   * @param level Selected level.
   * @param mode Selected training mode.
   * @returns Collection of renderable actions.
   */
  levelSelected(
    chatId: number,
    messageId: number,
    callbackId: string,
    level: string,
    mode: TrainingMode,
  ) {
    return Collection.of(
      Action.answerCallback({ callbackId }),
      Action.updateLastMessage({
        chatId,
        messageId,
        action: "renderLevelSelected",
        mode,
        level,
      }),
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
      return {
        text: `Режим: ${this.formatModeLabel(payload.mode)}. Выберите уровень:`,
        keyboard: this.buildLevelKeyboard(payload.mode),
      };
    }
    if (payload.action === "renderLevelSelected") {
      return {
        text: `Выбран ${this.formatModeLabel(payload.mode)} уровень ${payload.level.toUpperCase()}.`,
      };
    }
    if (payload.action === "renderInsufficientTerms") {
      return { text: "Недостаточно глаголов для тренировки." };
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
}
