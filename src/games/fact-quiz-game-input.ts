import { GameInput } from "./game-input";

/**
 * Input for fact-quiz answer selection.
 */
export class FactQuizGameInput extends GameInput {
  /**
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id.
   * @param callbackId Callback query id.
   * @param sessionId Session id from callback.
   * @param answerIndex Selected answer index.
   */
  constructor(
    readonly chatId: number,
    readonly messageId: number,
    readonly callbackId: string,
    readonly sessionId: string,
    readonly answerIndex: number,
  ) {
    super();
  }
}
