import { Collection, Option, some } from "scats";
import { Action, GameRenderPayload } from "../action";
import { GoogleSpreadsheetsService } from "../sheets";
import { MetricsService } from "../metrics";
import { LeveledBaseGame } from "./leveled-base-game";
import { TextGameInput } from "./text-game-input";
import { TelegramUpdateMessage } from "../telegram-types";
import { TrainingMode } from "../training";
import { TelegramService } from "../telegram";
import { SessionsRepository } from "../sessions.repository";
import { QuestionGenerator } from "../question-generator";
import { MenuService } from "../menu-service";

/**
 * Text-input game implementation.
 */
export class TextGame extends LeveledBaseGame<TextGameInput> {
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
    sheetsService: GoogleSpreadsheetsService,
    metricsService: MetricsService,
    spreadsheetId: string,
  ) {
    super(
      telegramService,
      sessionsRepository,
      questionGenerator,
      menuService,
      sheetsService,
      metricsService,
      spreadsheetId,
    );
  }

  /**
   * Builds a text-game input from a Telegram update.
   * @param update Incoming Telegram update DTO.
   * @returns Option with parsed text input, or none.
   */
  buildInput(update: TelegramUpdateMessage): Option<TextGameInput> {
    return update.message.flatMap((message) =>
      message.chat.flatMap((chat) =>
        message.text.map((text) => new TextGameInput(chat.id, text)),
      ),
    );
  }

  /**
   * Handles a single text answer input.
   * @param input Parsed text game input.
   * @returns Collection of renderable actions.
   */
  async invoke(input: TextGameInput): Promise<Collection<Action>> {
    // Validate session existence and required mode.
    const sessionOption = await this.sessionsRepository.getSessionByUserId(
      input.chatId,
    );
    if (!sessionOption.isDefined) {
      return await this.reportNoSession(input.chatId);
    }
    const session = sessionOption.getOrElseThrow(
      () => new Error("Missing session"),
    );
    if (!session.current.isDefined || session.mode !== TrainingMode.Write) {
      return await this.reportNoSession(input.chatId);
    }

    // Normalize user input and validate it is not empty.
    const current = session.current.getOrElseThrow(
      () => new Error("Missing current question"),
    );
    const answer = this.normalizeInput(input.text);
    if (!answer) {
      await this.metricsService.counter("InvalidAnswer").inc({
        Reason: "empty",
        Mode: session.mode,
        Level: session.level.toUpperCase(),
      });
      await this.metricsService.counter("InvalidAnswerTotal").inc();
      return Collection.of(
        Action.sendTgMessage({
          chatId: input.chatId,
          action: "renderInvalidAnswer",
          reason: "empty",
        }),
      );
    }

    // Load terms and compute result payload.
    const data = await this.sheetsService.loadDataBase(
      this.spreadsheetId,
      session.level.toUpperCase(),
    );
    const terms = data.get(session.mode).toArray;
    const questionTerm = terms[current.verbId];
    const correctAnswer = this.normalizeInput(questionTerm.greek);
    const isCorrect = this.matchesGreekInput(answer, correctAnswer);

    const updated = session.copy({
      totalAsked: session.totalAsked + 1,
      correctCount: session.correctCount + (isCorrect ? 1 : 0),
    });

    // Update message, emit metrics, and progress the session.
    const resultMessageId = updated.current.flatMap(
      (question) => question.messageId,
    ).orUndefined;
    const resultPayload = {
      action: "renderAnswerResult",
      chatId: input.chatId,
      currentQuestionIndex: this.currentQuestionNumber(updated),
      totalQuestions: this.totalQuestions(updated),
      term: questionTerm.russian,
      answerText: answer,
      correctText: questionTerm.greek,
      isCorrect,
    } as const;

    const resultActions = Collection.of(
      resultMessageId
        ? Action.updateLastMessage({
            ...resultPayload,
            messageId: resultMessageId,
          })
        : Action.sendTgMessage(resultPayload),
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

    // Build next question or finish the session.
    const nextPack = this.questionGenerator.createQuestion(
      data.get(session.mode),
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
    return resultActions.concat(this.sendQuestion(nextSession, terms));
  }

  /**
   * Normalizes a user input string for comparison.
   * @param value Input string.
   * @returns Normalized string.
   */
  private normalizeInput(value: string) {
    return value.trim().toLowerCase();
  }

  /**
   * Removes Greek accents for loose comparison.
   * @param value Input string.
   * @returns String without accents.
   */
  private removeGreekAccents(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300\u0301\u0342\u0344\u0345]/g, "")
      .normalize("NFC");
  }

  /**
   * Checks if the input contains Greek accent marks.
   * @param value Input string.
   * @returns True if accents are present.
   */
  private hasGreekAccent(value: string) {
    return /[\u0300\u0301\u0342\u0344\u0345]/.test(value.normalize("NFD"));
  }

  /**
   * Compares user input with the correct answer using accent rules.
   * @param input User input.
   * @param correct Correct answer.
   * @returns True when the input matches.
   */
  private matchesGreekInput(input: string, correct: string) {
    const normalizedInput = this.normalizeInput(input);
    const normalizedCorrect = this.normalizeInput(correct);
    if (!this.hasGreekAccent(normalizedInput)) {
      return (
        this.removeGreekAccents(normalizedInput) ===
        this.removeGreekAccents(normalizedCorrect)
      );
    }
    return normalizedInput === normalizedCorrect;
  }

  /**
   * Reports missing session errors and informs the user.
   * @param chatId Telegram chat id.
   * @returns Promise resolved when the warning is sent.
   */
  private async reportNoSession(chatId: number) {
    await this.metricsService.counter("InvalidAnswer").inc({
      Reason: "no_session",
      Mode: "write",
      Level: "unknown",
    });
    await this.metricsService.counter("InvalidAnswerTotal").inc();
    return Collection.of(
      Action.sendTgMessage({
        chatId,
        action: "renderNoActiveSession",
      }),
    );
  }

  /**
   * Builds render data for text-game actions.
   * @param payload Game render payload.
   * @returns Rendered message data.
   */
  protected renderGamePayload(payload: GameRenderPayload) {
    if (payload.action === "renderQuestion") {
      return {
        text: `Вопрос ${payload.currentQuestionIndex}/${payload.totalQuestions}\nПереведи: ${payload.term}`,
      };
    }
    if (payload.action === "renderAnswerResult") {
      const resultLine = payload.isCorrect ? "✅ Верно" : "❌ Неверно";
      return {
        text: [
          `Вопрос ${payload.currentQuestionIndex}/${payload.totalQuestions}`,
          `Переведи: ${payload.term}`,
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
    if (payload.action === "renderNoActiveSession") {
      return {
        text: "Нет активной тренировки. Напишите /start.",
      };
    }
    if (payload.action === "renderInvalidAnswer") {
      return {
        text: "Ответ пустой. Напишите слово на греческом.",
      };
    }
    return {
      text: "Не удалось обработать действие.",
    };
  }
}
