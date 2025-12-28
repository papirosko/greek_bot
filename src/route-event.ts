import { GameInvocation } from "./games/game-factory";
import { TrainingMode } from "./training";

/**
 * Internal event types for routing.
 */
export enum RouteEventType {
  Start = "start",
  UnsupportedCommand = "unsupportedCommand",
  ModeSelected = "modeSelected",
  LevelSelected = "levelSelected",
  GameInvocation = "gameInvocation",
  CallbackUnknown = "callbackUnknown",
}

export type RouteEventPayload =
  | { chatId: number }
  | {
      chatId: number;
      messageId: number;
      callbackId: string;
      mode: TrainingMode;
    }
  | {
      chatId: number;
      messageId: number;
      callbackId: string;
      level: string;
      mode: TrainingMode;
    }
  | { invocation: GameInvocation }
  | { callbackId: string };

/**
 * Internal event descriptor for quiz routing.
 */
export class RouteEvent {
  /**
   * @param type Event type.
   * @param payload Event payload.
   */
  constructor(
    readonly type: RouteEventType,
    readonly payload: RouteEventPayload,
  ) {}

  /**
   * Builds a start event.
   * @param chatId Telegram chat id.
   * @returns RouteEvent instance.
   */
  static start(chatId: number) {
    return new RouteEvent(RouteEventType.Start, { chatId });
  }

  /**
   * Builds an unsupported command event.
   * @param chatId Telegram chat id.
   * @returns RouteEvent instance.
   */
  static unsupportedCommand(chatId: number) {
    return new RouteEvent(RouteEventType.UnsupportedCommand, { chatId });
  }

  /**
   * Builds a mode selection event.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id.
   * @param callbackId Callback query id.
   * @param mode Training mode.
   * @returns RouteEvent instance.
   */
  static modeSelected(
    chatId: number,
    messageId: number,
    callbackId: string,
    mode: TrainingMode,
  ) {
    return new RouteEvent(RouteEventType.ModeSelected, {
      chatId,
      messageId,
      callbackId,
      mode,
    });
  }

  /**
   * Builds a level selection event.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id.
   * @param callbackId Callback query id.
   * @param level Selected level.
   * @param mode Training mode.
   * @returns RouteEvent instance.
   */
  static levelSelected(
    chatId: number,
    messageId: number,
    callbackId: string,
    level: string,
    mode: TrainingMode,
  ) {
    return new RouteEvent(RouteEventType.LevelSelected, {
      chatId,
      messageId,
      callbackId,
      level,
      mode,
    });
  }

  /**
   * Builds a game invocation event.
   * @param invocation Game invocation payload.
   * @returns RouteEvent instance.
   */
  static gameInvocation(invocation: GameInvocation) {
    return new RouteEvent(RouteEventType.GameInvocation, { invocation });
  }

  /**
   * Builds a fallback callback event.
   * @param callbackId Callback query id.
   * @returns RouteEvent instance.
   */
  static callbackUnknown(callbackId: string) {
    return new RouteEvent(RouteEventType.CallbackUnknown, { callbackId });
  }
}
