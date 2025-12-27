import { GameInput } from "./game-input";

/**
 * Input for a multiple-choice answer.
 */
export class ChoiceGameInput extends GameInput {
  /**
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id with the question.
   * @param callbackId Callback query id.
   * @param sessionId Session id.
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
