import { TelegramInlineKeyboard } from "./telegram-types";
import { Session } from "./session";

/**
 * Types of renderable actions for Telegram.
 */
export enum ActionType {
  SendTgMessage = "sendTgMessage",
  UpdateLastMessage = "updateLastMessage",
  SetKeyboard = "setKeyboard",
  AnswerCallback = "answerCallback",
}

/**
 * Payload for sending a message.
 */
export type SendMessagePayload = {
  chatId: number;
  text: string;
  keyboard?: TelegramInlineKeyboard;
  trackSession?: Session;
};

/**
 * Payload for editing a message text.
 */
export type EditMessageTextPayload = {
  chatId: number;
  messageId: number;
  text: string;
  keyboard?: TelegramInlineKeyboard;
};

/**
 * Payload for updating message keyboard only.
 */
export type SetKeyboardPayload = {
  chatId: number;
  messageId: number;
  keyboard: TelegramInlineKeyboard;
};

/**
 * Payload for answering a callback query.
 */
export type AnswerCallbackPayload = {
  callbackId: string;
};

/**
 * Union of supported action payloads.
 */
export type ActionPayload =
  | SendMessagePayload
  | EditMessageTextPayload
  | SetKeyboardPayload
  | AnswerCallbackPayload;

/**
 * Renderable action descriptor.
 */
export class Action {
  /**
   * @param type Action type.
   * @param payload Action payload.
   */
  constructor(
    readonly type: ActionType,
    readonly payload: ActionPayload,
  ) {}

  /**
   * Returns a plain object representation.
   * @returns Action item.
   */
  get item() {
    const payload = { ...(this.payload as Record<string, unknown>) };
    if ("trackSession" in payload) {
      delete payload.trackSession;
    }
    return {
      type: this.type,
      payload,
    };
  }

  /**
   * Builds a send-message action.
   * @param payload Send message payload.
   * @returns Action instance.
   */
  static sendTgMessage(payload: SendMessagePayload) {
    return new Action(ActionType.SendTgMessage, payload);
  }

  /**
   * Builds an edit-message action.
   * @param payload Edit message payload.
   * @returns Action instance.
   */
  static updateLastMessage(payload: EditMessageTextPayload) {
    return new Action(ActionType.UpdateLastMessage, payload);
  }

  /**
   * Builds a set-keyboard action.
   * @param payload Set keyboard payload.
   * @returns Action instance.
   */
  static setKeyboard(payload: SetKeyboardPayload) {
    return new Action(ActionType.SetKeyboard, payload);
  }

  /**
   * Builds an answer-callback action.
   * @param payload Answer callback payload.
   * @returns Action instance.
   */
  static answerCallback(payload: AnswerCallbackPayload) {
    return new Action(ActionType.AnswerCallback, payload);
  }
}

/**
 * Action renderer function.
 */
export type ActionsRenderer = (action: Action) => Promise<void>;
