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

export type GameInvocation = ChoiceGameInvocation | TextGameInvocation;

export class GameFactory {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly questionGenerator: QuestionGenerator,
    private readonly menuService: MenuService,
    private readonly sheetsService: GoogleSpreadsheetsService,
    private readonly metricsService: MetricsService,
    private readonly spreadsheetId: string,
  ) {}

  forMode(mode: TrainingMode) {
    return mode === TrainingMode.Write
      ? this.createTextGame()
      : this.createChoiceGame();
  }

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
