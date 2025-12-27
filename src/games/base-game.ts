import { Collection, Option, some } from "scats";
import type { Term } from "../quiz-data";
import { Session } from "../session";
import { SessionsRepository } from "../sessions.repository";
import { TelegramKeyboard, TelegramService } from "../telegram";
import { TelegramKeyboardButton } from "../telegram-types";
import { TelegramUpdateMessage } from "../telegram-types";
import { TrainingMode } from "../training";
import { QuestionGenerator } from "../question-generator";
import { GameInput } from "./game-input";
import { MenuService } from "../menu-service";

/**
 * Base class for game flows that handle session progression and messaging.
 */
export abstract class BaseGame<TInput extends GameInput> {
  /**
   * @param telegramService Telegram API client.
   * @param sessionsRepository Session persistence repository.
   * @param questionGenerator Question builder with randomized options.
   * @param menuService Menu sender for top-level navigation.
   * @param spreadsheetId Google Sheets spreadsheet id.
   */
  protected constructor(
    protected readonly telegramService: TelegramService,
    protected readonly sessionsRepository: SessionsRepository,
    protected readonly questionGenerator: QuestionGenerator,
    protected readonly menuService: MenuService,
    protected readonly spreadsheetId: string,
  ) {}

  /**
   * Builds a domain input for the game from a Telegram update.
   * @param update Incoming Telegram update DTO.
   * @returns Option with a game input if the update matches this game.
   */
  abstract buildInput(update: TelegramUpdateMessage): Option<TInput>;

  /**
   * Runs one step of the game using the given input.
   * @param input Parsed game input.
   * @returns Promise resolved when the step completes.
   */
  abstract invoke(input: TInput): Promise<void>;

  /**
   * Calculates the total question count for the session.
   * @param session Current session.
   * @returns Total number of questions.
   */
  protected totalQuestions(session: Session) {
    return (
      session.totalCount ??
      session.totalAsked +
        session.remainingIds.length +
        (session.current.isDefined ? 1 : 0)
    );
  }

  /**
   * Calculates the current question index (1-based).
   * @param session Current session.
   * @returns Current question number.
   */
  protected currentQuestionNumber(session: Session) {
    return session.totalAsked + 1;
  }

  /**
   * Builds the prompt for a question based on the session mode.
   * @param session Current session.
   * @param term Question term.
   * @returns Text prompt for the user.
   */
  protected buildPrompt(
    session: Session,
    term: { greek: string; russian: string },
  ) {
    if (
      session.mode === TrainingMode.RuGr ||
      session.mode === TrainingMode.Write
    ) {
      return `Вопрос ${this.currentQuestionNumber(session)}/${this.totalQuestions(session)}\nПереведи: ${term.russian}`;
    }
    return `Вопрос ${this.currentQuestionNumber(session)}/${this.totalQuestions(session)}\nПереведи: ${term.greek}`;
  }

  /**
   * Builds an inline keyboard with answer options.
   * @param sessionId Session id for callback binding.
   * @param options Answer options text.
   * @returns Inline keyboard payload.
   */
  protected buildOptionsKeyboard(sessionId: string, options: string[]) {
    const buttons = options.map<TelegramKeyboardButton>((text, index) => ({
      text,
      callback_data: `s=${sessionId}&a=${index}`,
    }));
    const rows: TelegramKeyboardButton[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    return TelegramKeyboard.inline(rows);
  }

  /**
   * Sends the current question and persists the message id in the session.
   * @param session Current session.
   * @param terms Term list for rendering prompts.
   * @returns Promise resolved when the message is sent and stored.
   */
  async sendQuestion(
    session: Session,
    terms: { greek: string; russian: string }[],
  ) {
    // Ensure we have a current question to render.
    if (!session.current.isDefined) {
      return;
    }
    // Build prompt and options for the current question.
    const current = session.current.getOrElseThrow(
      () => new Error("Missing current question"),
    );
    const questionTerm = terms[current.verbId];
    const optionTexts =
      session.mode === TrainingMode.RuGr
        ? current.options.map((id) => terms[id].greek).toArray
        : current.options.map((id) => terms[id].russian).toArray;
    const response =
      session.mode === TrainingMode.Write
        ? await this.telegramService.sendMessage(
            session.userId,
            this.buildPrompt(session, questionTerm),
          )
        : await this.telegramService.sendMessage(
            session.userId,
            this.buildPrompt(session, questionTerm),
            this.buildOptionsKeyboard(session.sessionId, optionTexts),
          );

    // Persist message id to support edits later.
    const messageId = response.result?.message_id;
    if (messageId) {
      const updated = session.copy({
        current: session.current.map((question) =>
          question.copy({ messageId: some(messageId) }),
        ),
      });
      await this.sessionsRepository.putSession(updated);
    }
  }

  /**
   * Creates a question pack for the given session.
   * @param terms Terms collection.
   * @param session Current session.
   * @returns Question pack with updated remaining ids, or null when done.
   */
  createQuestionPack(terms: Collection<Term>, session: Session) {
    return this.questionGenerator.createQuestion(
      terms,
      session.remainingIds.toSet,
    );
  }
}
