import { GameInput } from "./game-input";

export class ChoiceGameInput extends GameInput {
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
