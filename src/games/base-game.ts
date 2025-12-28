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
import {
  Action,
  ActionsRenderer,
  ActionType,
  AnswerCallbackPayload,
  EditMessageTextPayload,
  SendMessagePayload,
  SetKeyboardPayload,
} from "../action";

/**
 * Base class for game flows that handle session progression and messaging.
 */
export abstract class BaseGame<TInput extends GameInput> {
  private _actionsRenderer: ActionsRenderer = (action) =>
    this.renderActionImpl(action);
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
   * @returns Collection of renderable actions.
   */
  abstract invoke(input: TInput): Promise<Collection<Action>>;

  async renderAction(action: Action): Promise<void> {
    await this._actionsRenderer(action);
  }

  /**
   * Default action rendering implementation.
   * @param action Renderable action.
   * @returns Promise resolved when the action is rendered.
   */
  protected async renderActionImpl(action: Action): Promise<void> {
    if (action.type === ActionType.SendTgMessage) {
      const payload = action.payload as SendMessagePayload;
      const response = await this.telegramService.sendMessage(
        payload.chatId,
        payload.text,
        payload.keyboard,
      );
      await this.trackSessionMessage(payload, response.result?.message_id);
      return;
    }
    if (action.type === ActionType.UpdateLastMessage) {
      const payload = action.payload as EditMessageTextPayload;
      await this.telegramService.editMessageText(
        payload.chatId,
        payload.messageId,
        payload.text,
        payload.keyboard,
      );
      return;
    }
    if (action.type === ActionType.SetKeyboard) {
      const payload = action.payload as SetKeyboardPayload;
      await this.telegramService.editMessageReplyMarkup(
        payload.chatId,
        payload.messageId,
        payload.keyboard,
      );
      return;
    }
    if (action.type === ActionType.AnswerCallback) {
      const payload = action.payload as AnswerCallbackPayload;
      await this.telegramService.answerCallback(payload.callbackId);
    }
  }

  /**
   * Overrides the action renderer (useful for tests).
   * @param renderer Custom action renderer.
   */
  set actionsRenderer(renderer: ActionsRenderer) {
    this._actionsRenderer = renderer.bind(this);
  }

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
  sendQuestion(session: Session, terms: { greek: string; russian: string }[]) {
    // Ensure we have a current question to render.
    if (!session.current.isDefined) {
      return Collection.empty as Collection<Action>;
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
    const text = this.buildPrompt(session, questionTerm);
    const keyboard =
      session.mode === TrainingMode.Write
        ? undefined
        : this.buildOptionsKeyboard(session.sessionId, optionTexts);

    return Collection.from([
      Action.sendTgMessage({
        chatId: session.userId,
        text,
        keyboard,
        trackSession: session,
      }),
    ]);
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

  /**
   * Tracks the message id for the current question when requested.
   * @param payload Send-message payload.
   * @param messageId Telegram message id.
   * @returns Promise resolved when session is updated.
   */
  private async trackSessionMessage(
    payload: SendMessagePayload,
    messageId?: number,
  ) {
    if (!payload.trackSession || !messageId) {
      return;
    }
    const updated = payload.trackSession.copy({
      current: payload.trackSession.current.map((question) =>
        question.copy({ messageId: some(messageId) }),
      ),
    });
    await this.sessionsRepository.putSession(updated);
  }
}
