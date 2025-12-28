import { Collection, Option, none, option, some } from "scats";
import { Action, GameRenderPayload } from "../action";
import { GoogleSpreadsheetsService } from "../sheets";
import { MetricsService } from "../metrics";
import { BaseGame } from "./base-game";
import { FactQuizGameInput } from "./fact-quiz-game-input";
import { TelegramUpdateMessage } from "../telegram-types";
import { TrainingMode } from "../training";
import { TelegramKeyboard, TelegramService } from "../telegram";
import { SessionsRepository } from "../sessions.repository";
import { QuestionGenerator } from "../question-generator";
import { MenuService } from "../menu-service";
import { FactTopic } from "../fact-topic";
import { Session } from "../session";
import { FactQuestionService } from "../fact-question-service";
import { SessionQuestion } from "../session-question";

const MAX_RECENT_FACTS = 20;

/**
 * Multiple-choice game with AI-generated fact texts.
 */
export class FactQuizGame extends BaseGame<FactQuizGameInput> {
  /**
   * @param telegramService Telegram API client.
   * @param sessionsRepository Session persistence repository.
   * @param questionGenerator Question builder with randomized options.
   * @param menuService Menu sender for top-level navigation.
   * @param sheetsService Google Sheets data reader.
   * @param metricsService CloudWatch metrics client.
   * @param factQuestionService AI fact generator.
   * @param spreadsheetId Google Sheets spreadsheet id.
   */
  constructor(
    telegramService: TelegramService,
    sessionsRepository: SessionsRepository,
    questionGenerator: QuestionGenerator,
    menuService: MenuService,
    private readonly sheetsService: GoogleSpreadsheetsService,
    private readonly metricsService: MetricsService,
    private readonly factQuestionService: FactQuestionService,
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
   * Builds an input from a Telegram update.
   * @param update Incoming Telegram update DTO.
   * @returns Option with parsed input, or none.
   */
  buildInput(update: TelegramUpdateMessage): Option<FactQuizGameInput> {
    return update.callbackQuery.flatMap((query) => {
      const matchOption = query.data.flatMap((data) =>
        option(data.match(/^f=([^&]+)&a=(\d+)$/)),
      );
      return matchOption.flatMap((match) =>
        query.message.flatMap((message) =>
          message.chat.flatMap((chat) =>
            message.messageId.map(
              (messageId) =>
                new FactQuizGameInput(
                  chat.id,
                  messageId,
                  query.id,
                  match[1],
                  Number(match[2]),
                ),
            ),
          ),
        ),
      );
    });
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

    const topics = await this.sheetsService.loadFactTopics(
      this.spreadsheetId,
      level,
    );
    if (topics.length < 1) {
      return actions.concat(this.menuService.insufficientTerms(chatId));
    }

    const ids = Collection.fill<number>(topics.length)((index) => index);
    const session = this.sessionsRepository.createSession(
      chatId,
      level,
      TrainingMode.FactQuiz,
      ids,
    );
    const nextSession = await this.buildNextQuestion(session, topics);
    if (!nextSession.isDefined) {
      return actions.concat(this.menuService.questionBuildFailed(chatId));
    }

    const updated = await this.sessionsRepository.putSession(
      nextSession.getOrElseThrow(() => new Error("Missing session")),
    );
    await this.metricsService.counter("SessionStart").inc({
      Mode: updated.mode,
      Level: updated.level.toUpperCase(),
    });
    await this.metricsService.counter("SessionStartTotal").inc();

    return actions.concat(this.sendFactQuestion(updated));
  }

  /**
   * Handles a single answer selection.
   * @param input Parsed choice input.
   * @returns Collection of renderable actions.
   */
  async invoke(input: FactQuizGameInput): Promise<Collection<Action>> {
    const sessionOption = await this.sessionsRepository.getSession(
      input.sessionId,
    );
    if (!sessionOption.isDefined) {
      return Collection.of(
        Action.answerCallback({ callbackId: input.callbackId }),
        Action.sendTgMessage({
          chatId: input.chatId,
          action: "renderMissingSession",
        }),
      );
    }
    const session = sessionOption.getOrElseThrow(
      () => new Error("Missing session"),
    );
    if (!session.current.isDefined) {
      return Collection.of(
        Action.answerCallback({ callbackId: input.callbackId }),
        Action.sendTgMessage({
          chatId: input.chatId,
          action: "renderMissingSession",
        }),
      );
    }

    const current = session.current.getOrElseThrow(
      () => new Error("Missing current question"),
    );
    if (current.messageId.exists((id) => id !== input.messageId)) {
      return Collection.of(
        Action.answerCallback({ callbackId: input.callbackId }),
        Action.sendTgMessage({
          chatId: input.chatId,
          action: "renderInactiveQuestion",
        }),
      );
    }

    const questionText = this.buildQuestionText(current);
    const options = current.answerOptions
      .map((items) => items.toArray)
      .getOrElseValue([]);
    if (!questionText || options.length !== 4) {
      return Collection.of(
        Action.answerCallback({ callbackId: input.callbackId }),
        Action.sendTgMessage({
          chatId: input.chatId,
          action: "renderQuestionBuildFailed",
        }),
      );
    }
    if (input.answerIndex < 0 || input.answerIndex >= options.length) {
      return Collection.of(
        Action.answerCallback({ callbackId: input.callbackId }),
        Action.sendTgMessage({
          chatId: input.chatId,
          action: "renderQuestionBuildFailed",
        }),
      );
    }

    const isCorrect = input.answerIndex === current.correctIndex;
    const answeredIndex = this.currentQuestionNumber(session);
    const totalQuestions = this.totalQuestions(session);
    const updated = session.copy({
      totalAsked: session.totalAsked + 1,
      correctCount: session.correctCount + (isCorrect ? 1 : 0),
    });

    const resultActions = Collection.of(
      Action.answerCallback({ callbackId: input.callbackId }),
      Action.updateLastMessage({
        chatId: input.chatId,
        messageId: input.messageId,
        action: "renderAnswerResult",
        currentQuestionIndex: answeredIndex,
        totalQuestions,
        term: questionText,
        answerText: options[input.answerIndex],
        correctText: options[current.correctIndex],
        isCorrect,
      }),
    );
    await this.metricsService.counter("QuestionAnswered").inc({
      Mode: updated.mode,
      Level: updated.level.toUpperCase(),
      Result: isCorrect ? "correct" : "wrong",
    });
    await this.metricsService.counter("QuestionAnsweredTotal").inc();
    await this.metricsService
      .counter(isCorrect ? "QuestionAnsweredCorrect" : "QuestionAnsweredWrong")
      .inc();

    const topics = await this.sheetsService.loadFactTopics(
      this.spreadsheetId,
      session.level,
    );
    const nextSessionOption = await this.buildNextQuestion(updated, topics);
    if (!nextSessionOption.isDefined) {
      await this.sessionsRepository.putSession(updated);
      await this.metricsService.counter("SessionEnd").inc({
        Mode: updated.mode,
        Level: updated.level.toUpperCase(),
      });
      await this.metricsService.counter("SessionEndTotal").inc();
      return resultActions
        .concat(
          Collection.of(
            Action.sendTgMessage({
              chatId: input.chatId,
              action: "renderSessionEnd",
              correctCount: updated.correctCount,
              totalAsked: updated.totalAsked,
            }),
          ),
        )
        .concat(this.menuService.start(input.chatId));
    }

    const nextSession = nextSessionOption.getOrElseThrow(
      () => new Error("Missing next session"),
    );
    await this.sessionsRepository.putSession(nextSession);
    return resultActions.concat(this.sendFactQuestion(nextSession));
  }

  /**
   * Builds render data for fact-quiz actions.
   * @param payload Game render payload.
   * @returns Rendered message data.
   */
  protected renderGamePayload(payload: GameRenderPayload) {
    if (payload.action === "renderQuestion") {
      if (!payload.sessionId) {
        return {
          text: "Не удалось обработать действие.",
        };
      }
      const keyboard = this.buildFactKeyboard(
        payload.sessionId,
        payload.options ?? [],
      );
      return {
        text: [
          `Вопрос ${payload.currentQuestionIndex}/${payload.totalQuestions}`,
          payload.term,
        ].join("\n"),
        keyboard,
      };
    }
    if (payload.action === "renderAnswerResult") {
      const resultLine = payload.isCorrect ? "✅ Верно" : "❌ Неверно";
      return {
        text: [
          `Вопрос ${payload.currentQuestionIndex}/${payload.totalQuestions}`,
          "Текст и вопрос:",
          payload.term,
          `Ваш ответ: ${payload.answerText}`,
          `Правильный ответ: ${payload.correctText}`,
          resultLine,
        ].join("\n"),
      };
    }
    if (payload.action === "renderSessionEnd") {
      return {
        text: `Сессия завершена. Правильных: ${payload.correctCount} из ${payload.totalAsked}.`,
      };
    }
    if (payload.action === "renderMissingSession") {
      return {
        text: "Сессия не найдена. Начните заново через /start.",
      };
    }
    if (payload.action === "renderInactiveQuestion") {
      return {
        text: "Этот вопрос уже не активен. Начните заново через /start.",
      };
    }
    return {
      text: "Не удалось обработать действие.",
    };
  }

  /**
   * Sends the current fact question.
   * @param session Current session.
   * @returns Collection of renderable actions.
   */
  private sendFactQuestion(session: Session) {
    if (!session.current.isDefined) {
      return Collection.empty as Collection<Action>;
    }
    const current = session.current.getOrElseThrow(
      () => new Error("Missing current question"),
    );
    const questionText = this.buildQuestionText(current);
    const options = current.answerOptions
      .map((items) => items.toArray)
      .getOrElseValue([]);
    if (!questionText || options.length !== 4) {
      return Collection.of(
        Action.sendTgMessage({
          chatId: session.userId,
          action: "renderQuestionBuildFailed",
        }),
      );
    }
    return Collection.of(
      Action.sendTgMessage({
        chatId: session.userId,
        action: "renderQuestion",
        currentQuestionIndex: this.currentQuestionNumber(session),
        totalQuestions: this.totalQuestions(session),
        term: questionText,
        options,
        sessionId: session.sessionId,
        trackSession: session,
      }),
    );
  }

  /**
   * Builds a combined question text.
   * @param question Session question data.
   * @returns Combined fact + question text.
   */
  private buildQuestionText(question: SessionQuestion) {
    const fact = question.promptText.getOrElseValue("").trim();
    const q = question.questionText.getOrElseValue("").trim();
    if (!fact || !q) {
      return "";
    }
    return [fact, q].join("\n\n");
  }

  /**
   * Builds an inline keyboard for fact-quiz options.
   * @param sessionId Session id for callback binding.
   * @param options Option labels.
   * @returns Inline keyboard payload.
   */
  private buildFactKeyboard(sessionId: string, options: string[]) {
    const buttons = options.map((text, index) => ({
      text,
      callback_data: `f=${sessionId}&a=${index}`,
    }));
    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    return TelegramKeyboard.inline(rows);
  }

  /**
   * Builds the next question by requesting the AI service.
   * @param session Current session.
   * @param topics Available topics.
   * @returns Option with updated session.
   */
  private async buildNextQuestion(
    session: Session,
    topics: Collection<FactTopic>,
  ): Promise<Option<Session>> {
    if (session.remainingIds.isEmpty) {
      return none;
    }
    const remaining = session.remainingIds.toArray;
    const pick = Math.floor(Math.random() * remaining.length);
    const topicId = remaining[pick];
    const topic = topics.get(topicId);
    const nextRemaining = remaining.filter((id) => id !== topicId);

    try {
      const question = await this.factQuestionService.generate(
        session.level,
        topic,
        session.recentFacts.toArray,
      );
      const updatedFacts = this.appendRecentFact(
        session.recentFacts.toArray,
        question.fact,
      );
      const options = Collection.of(0, 1, 2, 3);
      const answerOptions = Collection.from(question.options);
      const sessionQuestion = new SessionQuestion(
        topicId,
        options,
        question.correctIndex,
        none,
        some(question.fact),
        some(question.question),
        some(answerOptions),
      );
      return option(
        session.copy({
          current: some(sessionQuestion),
          remainingIds: new Collection(nextRemaining),
          recentFacts: new Collection(updatedFacts),
        }),
      );
    } catch (error) {
      console.error("fact_question_error", error);
      await this.metricsService.counter("QuestionBuildFailed").inc({
        Mode: session.mode,
        Level: session.level.toUpperCase(),
      });
      await this.metricsService.counter("QuestionBuildFailedTotal").inc();
      return none;
    }
  }

  /**
   * Appends a fact and keeps only the last N items.
   * @param recentFacts Recent fact list.
   * @param fact New fact text.
   * @returns Updated recent facts.
   */
  private appendRecentFact(recentFacts: string[], fact: string) {
    const updated = recentFacts.concat(fact);
    return updated.slice(-MAX_RECENT_FACTS);
  }
}
