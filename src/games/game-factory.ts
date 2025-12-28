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
import { ActionsRenderer } from "../action";
import { BaseGame } from "./base-game";
import { TextTopicGame } from "./text-topic-game";
import { TextTopicGameInput } from "./text-topic-game-input";
import { FactQuizGame } from "./fact-quiz-game";
import { FactQuizGameInput } from "./fact-quiz-game-input";
import { FactQuestionService } from "../fact-question-service";

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

type TextTopicGameInvocation = {
  kind: "text-topic";
  game: TextTopicGame;
  input: TextTopicGameInput;
};

type FactQuizGameInvocation = {
  kind: "fact-quiz";
  game: FactQuizGame;
  input: FactQuizGameInput;
};

/**
 * Union describing a resolved game instance and input.
 */
export type GameInvocation =
  | ChoiceGameInvocation
  | TextGameInvocation
  | TextTopicGameInvocation
  | FactQuizGameInvocation;

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
    private readonly factQuestionService: FactQuestionService,
    private readonly spreadsheetId: string,
    private readonly actionsRendererFactory?: (
      game: BaseGame<any>,
    ) => ActionsRenderer,
  ) {}

  /**
   * Returns a game instance for the given training mode.
   * @param mode Selected training mode.
   * @returns Game instance handling that mode.
   */
  forMode(mode: TrainingMode) {
    if (mode === TrainingMode.TextTopic) {
      return this.createTextTopicGame();
    }
    if (mode === TrainingMode.FactQuiz) {
      return this.createFactQuizGame();
    }
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
    const textTopicGame = this.createTextTopicGame();
    const textTopicInput = textTopicGame.buildInput(update);
    if (textTopicInput.isDefined) {
      return some<GameInvocation>({
        kind: "text-topic",
        game: textTopicGame,
        input: textTopicInput.getOrElseThrow(
          () => new Error("Missing text-topic input"),
        ),
      });
    }

    const factQuizGame = this.createFactQuizGame();
    const factQuizInput = factQuizGame.buildInput(update);
    if (factQuizInput.isDefined) {
      return some<GameInvocation>({
        kind: "fact-quiz",
        game: factQuizGame,
        input: factQuizInput.getOrElseThrow(
          () => new Error("Missing fact-quiz input"),
        ),
      });
    }

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
    const game = new ChoiceGame(
      this.telegramService,
      this.sessionsRepository,
      this.questionGenerator,
      this.menuService,
      this.sheetsService,
      this.metricsService,
      this.spreadsheetId,
    );
    this.applyRenderer(game);
    return game;
  }

  /**
   * Builds a text-game instance.
   * @returns TextGame instance.
   */
  private createTextGame() {
    const game = new TextGame(
      this.telegramService,
      this.sessionsRepository,
      this.questionGenerator,
      this.menuService,
      this.sheetsService,
      this.metricsService,
      this.spreadsheetId,
    );
    this.applyRenderer(game);
    return game;
  }

  /**
   * Builds a text-topic game instance.
   * @returns TextTopicGame instance.
   */
  private createTextTopicGame() {
    const game = new TextTopicGame(
      this.telegramService,
      this.sessionsRepository,
      this.questionGenerator,
      this.menuService,
      this.sheetsService,
      this.metricsService,
      this.spreadsheetId,
    );
    this.applyRenderer(game);
    return game;
  }

  /**
   * Builds a fact-quiz game instance.
   * @returns FactQuizGame instance.
   */
  private createFactQuizGame() {
    const game = new FactQuizGame(
      this.telegramService,
      this.sessionsRepository,
      this.questionGenerator,
      this.menuService,
      this.sheetsService,
      this.metricsService,
      this.factQuestionService,
      this.spreadsheetId,
    );
    this.applyRenderer(game);
    return game;
  }

  private applyRenderer(game: BaseGame<any>) {
    if (this.actionsRendererFactory) {
      game.actionsRenderer = this.actionsRendererFactory(game);
    }
  }
}
