import { GameInput } from "./game-input";

export class TextGameInput extends GameInput {
  constructor(
    readonly chatId: number,
    readonly text: string,
  ) {
    super();
  }
}
