import { Collection, Option, option, some } from "scats";
import { Action, GameRenderPayload } from "../action";
import { GoogleSpreadsheetsService } from "../sheets";
import { MetricsService } from "../metrics";
import { BaseGame } from "./base-game";
import { TextTopicGameInput } from "./text-topic-game-input";
import { TelegramUpdateMessage } from "../telegram-types";
import { TrainingMode } from "../training";
import { TelegramKeyboard, TelegramService } from "../telegram";
import { SessionsRepository } from "../sessions.repository";
import { QuestionGenerator } from "../question-generator";
import { MenuService } from "../menu-service";
import { TextTopic } from "../text-topic";
import { Session } from "../session";

/**
 * Multiple-choice game for selecting a topic from a short text.
 */
export class TextTopicGame extends BaseGame<TextTopicGameInput> {
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
    telegramService: TelegramService,
    sessionsRepository: SessionsRepository,
    questionGenerator: QuestionGenerator,
    menuService: MenuService,
    private readonly sheetsService: GoogleSpreadsheetsService,
    private readonly metricsService: MetricsService,
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
  buildInput(update: TelegramUpdateMessage): Option<TextTopicGameInput> {
    return update.callbackQuery.flatMap((query) => {
      const matchOption = query.data.flatMap((data) =>
        option(data.match(/^t=([^&]+)&a=(\d+)$/)),
      );
      return matchOption.flatMap((match) =>
        query.message.flatMap((message) =>
          message.chat.flatMap((chat) =>
            message.messageId.map(
              (messageId) =>
                new TextTopicGameInput(
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

    const topics = await this.sheetsService.loadTextTopics(
      this.spreadsheetId,
      level,
    );
    if (topics.length < 4) {
      return actions.concat(this.menuService.insufficientTerms(chatId));
    }

    const ids = Collection.fill<number>(topics.length)((index) => index);
    const session = this.sessionsRepository.createSession(
      chatId,
      level,
      TrainingMode.TextTopic,
      ids,
    );
    const questionPack = this.questionGenerator.createQuestion(
      topics,
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

    return actions.concat(this.sendTopicQuestion(updated, topics));
  }

  /**
   * Handles a single answer selection.
   * @param input Parsed choice input.
   * @returns Collection of renderable actions.
   */
  async invoke(input: TextTopicGameInput): Promise<Collection<Action>> {
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

    const topics = await this.sheetsService.loadTextTopics(
      this.spreadsheetId,
      session.level,
    );
    const questionItem = topics.get(current.verbId);
    const selectedId = current.options.get(input.answerIndex);
    const selectedTopic = topics.get(selectedId);
    const correctTopic = topics.get(current.options.get(current.correctIndex));

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
        term: questionItem.text,
        answerText: selectedTopic.topic,
        correctText: correctTopic.topic,
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

    const nextPack = this.questionGenerator.createQuestion(
      topics,
      updated.remainingIds.toSet,
    );
    if (!nextPack) {
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

    const nextSession = updated.copy({
      current: some(nextPack.question),
      remainingIds: nextPack.remaining.toCollection,
    });
    await this.sessionsRepository.putSession(nextSession);
    return resultActions.concat(this.sendTopicQuestion(nextSession, topics));
  }

  /**
   * Builds render data for text-topic actions.
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
      const keyboard = this.buildTopicKeyboard(
        payload.sessionId,
        payload.options ?? [],
      );
      return {
        text: [
          `Вопрос ${payload.currentQuestionIndex}/${payload.totalQuestions}`,
          "Прочитай текст и выбери тему:",
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
          "Текст:",
          payload.term,
          `Ваш ответ: ${payload.answerText}`,
          `Правильная тема: ${payload.correctText}`,
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
   * Sends the current text-topic question.
   * @param session Current session.
   * @param topics Text-topic data.
   * @returns Collection of renderable actions.
   */
  /**
   * Sends the current text-topic question.
   * @param session Current session.
   * @param topics Text-topic data.
   * @returns Collection of renderable actions.
   */
  private sendTopicQuestion(session: Session, topics: Collection<TextTopic>) {
    if (!session.current.isDefined) {
      return Collection.empty as Collection<Action>;
    }
    const current = session.current.getOrElseThrow(
      () => new Error("Missing current question"),
    );
    const questionItem = topics.get(current.verbId);
    const optionTexts = current.options.map(
      (id: number) => topics.get(id).topic,
    ).toArray;
    return Collection.of(
      Action.sendTgMessage({
        chatId: session.userId,
        action: "renderQuestion",
        currentQuestionIndex: this.currentQuestionNumber(session),
        totalQuestions: this.totalQuestions(session),
        term: questionItem.text,
        options: optionTexts,
        sessionId: session.sessionId,
        trackSession: session,
      }),
    );
  }

  /**
   * Builds an inline keyboard for text-topic options.
   * @param sessionId Session id for callback binding.
   * @param options Topic options to render.
   * @returns Inline keyboard payload.
   */
  private buildTopicKeyboard(sessionId: string, options: string[]) {
    const buttons = options.map((text, index) => ({
      text,
      callback_data: `t=${sessionId}&a=${index}`,
    }));
    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    return TelegramKeyboard.inline(rows);
  }
}
