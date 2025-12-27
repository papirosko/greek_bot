import { Option, none, some } from "scats";
import { TelegramUpdateMessage } from "../telegram-types";
import { TrainingMode } from "../training";
import { ChoiceGame } from "./choice-game";
import { ChoiceGameInput } from "./choice-game-input";
import { MetricsService } from "../metrics";
import { QuestionGenerator } from "../question-generator";
import { SessionsRepository } from "../sessions.repository";
import { TelegramService } from "../telegram";
import { GoogleSpreadsheetsService } from "../sheets";
import { MenuService } from "../menu-service";
import { TextGame } from "./text-game";
import { TextGameInput } from "./text-game-input";

type ChoiceGameInvocation = {
  kind: "choice";
  game: ChoiceGame;
  input: ChoiceGameInput;
};

type TextGameInvocation = {
  kind: "text";
  game: TextGame;
  input: TextGameInput;
};

/**
 * Union describing a resolved game instance and input.
 */
export type GameInvocation = ChoiceGameInvocation | TextGameInvocation;

/**
 * Factory that creates games and resolves updates to inputs.
 */
export class GameFactory {
  /**
   * @param telegramService Telegram API client.
   * @param sessionsRepository Session persistence repository.
   * @param questionGenerator Question builder with randomized options.
   * @param menuService Menu sender for top-level navigation.
   * @param sheetsService Google Sheets data reader.
   * @param metricsService CloudWatch metrics client.
   * @param spreadsheetId Google Sheets spreadsheet id.
   */
  constructor(
    private readonly telegramService: TelegramService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly questionGenerator: QuestionGenerator,
    private readonly menuService: MenuService,
    private readonly sheetsService: GoogleSpreadsheetsService,
    private readonly metricsService: MetricsService,
    private readonly spreadsheetId: string,
  ) {}

  /**
   * Returns a game instance for the given training mode.
   * @param mode Selected training mode.
   * @returns Game instance handling that mode.
   */
  forMode(mode: TrainingMode) {
    return mode === TrainingMode.Write
      ? this.createTextGame()
      : this.createChoiceGame();
  }

  /**
   * Resolves a Telegram update into a game invocation if possible.
   * @param update Incoming Telegram update DTO.
   * @returns Option with game and input.
   */
  forUpdate(update: TelegramUpdateMessage): Option<GameInvocation> {
    const choiceGame = this.createChoiceGame();
    const choiceInput = choiceGame.buildInput(update);
    if (choiceInput.isDefined) {
      return some<GameInvocation>({
        kind: "choice",
        game: choiceGame,
        input: choiceInput.getOrElseThrow(
          () => new Error("Missing choice input"),
        ),
      });
    }

    const textGame = this.createTextGame();
    const textInput = textGame.buildInput(update);
    if (textInput.isDefined) {
      return some<GameInvocation>({
        kind: "text",
        game: textGame,
        input: textInput.getOrElseThrow(() => new Error("Missing text input")),
      });
    }

    return none;
  }

  /**
   * Builds a choice-game instance.
   * @returns ChoiceGame instance.
   */
  private createChoiceGame() {
    return new ChoiceGame(
      this.telegramService,
      this.sessionsRepository,
      this.questionGenerator,
      this.menuService,
      this.sheetsService,
      this.metricsService,
      this.spreadsheetId,
    );
  }

  /**
   * Builds a text-game instance.
   * @returns TextGame instance.
   */
  private createTextGame() {
    return new TextGame(
      this.telegramService,
      this.sessionsRepository,
      this.questionGenerator,
      this.menuService,
      this.sheetsService,
      this.metricsService,
      this.spreadsheetId,
    );
  }
}
