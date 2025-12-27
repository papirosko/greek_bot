import { GameInput } from "./game-input";

/**
 * Input for a text answer.
 */
export class TextGameInput extends GameInput {
  /**
   * @param chatId Telegram chat id.
   * @param text User-entered text.
   */
  constructor(
    readonly chatId: number,
    readonly text: string,
  ) {
    super();
  }
}
