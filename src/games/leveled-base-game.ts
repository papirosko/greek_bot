import { Collection, some } from "scats";
import { Action } from "../action";
import { GoogleSpreadsheetsService } from "../sheets";
import { MetricsService } from "../metrics";
import { TrainingMode } from "../training";
import { Term } from "../quiz-data";
import { QuestionGenerator } from "../question-generator";
import { SessionsRepository } from "../sessions.repository";
import { TelegramService } from "../telegram";
import { MenuService } from "../menu-service";
import { BaseGame } from "./base-game";
import { GameInput } from "./game-input";

/**
 * Base game with level-based session setup.
 */
export abstract class LeveledBaseGame<
  TInput extends GameInput,
> extends BaseGame<TInput> {
  /**
   * @param telegramService Telegram API client.
   * @param sessionsRepository Session persistence repository.
   * @param questionGenerator Question builder with randomized options.
   * @param menuService Menu sender for top-level navigation.
   * @param sheetsService Google Sheets data reader.
   * @param metricsService CloudWatch metrics client.
   * @param spreadsheetId Google Sheets spreadsheet id.
   */
  protected constructor(
    telegramService: TelegramService,
    sessionsRepository: SessionsRepository,
    questionGenerator: QuestionGenerator,
    menuService: MenuService,
    protected readonly sheetsService: GoogleSpreadsheetsService,
    protected readonly metricsService: MetricsService,
    spreadsheetId: string,
  ) {
    super(
      telegramService,
      sessionsRepository,
      questionGenerator,
      menuService,
      spreadsheetId,
    );
  }

  /**
   * Handles level selection and starts a session.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id to edit.
   * @param callbackId Callback query id.
   * @param level Selected level.
   * @param mode Selected training mode.
   * @returns Collection of renderable actions.
   */
  async handleLevel(
    chatId: number,
    messageId: number,
    callbackId: string,
    level: string,
    mode: TrainingMode,
  ): Promise<Collection<Action>> {
    const actions = this.menuService.levelSelected(
      chatId,
      messageId,
      callbackId,
      level,
      mode,
    );

    const data = await this.sheetsService.loadDataBase(
      this.spreadsheetId,
      level.toUpperCase(),
    );
    const terms = data.get(mode).toArray;
    if (terms.length < 4) {
      return actions.concat(this.menuService.insufficientTerms(chatId));
    }

    const ids = Collection.fill<number>(terms.length)((index) => index);
    const session = this.sessionsRepository.createSession(
      chatId,
      level,
      mode,
      ids,
    );
    const questionPack = this.questionGenerator.createQuestion(
      new Collection<Term>(terms),
      session.remainingIds.toSet,
    );
    if (!questionPack) {
      return actions.concat(this.menuService.questionBuildFailed(chatId));
    }

    const updated = session.copy({
      current: some(questionPack.question),
      remainingIds: questionPack.remaining.toCollection,
    });
    await this.sessionsRepository.putSession(updated);
    await this.metricsService.counter("SessionStart").inc({
      Mode: updated.mode,
      Level: updated.level.toUpperCase(),
    });
    await this.metricsService.counter("SessionStartTotal").inc();

    return actions.concat(this.sendQuestion(updated, terms));
  }
}
