import { Option, some } from "scats";
import { GoogleSpreadsheetsService } from "../sheets";
import { MetricsService } from "../metrics";
import { BaseGame } from "./base-game";
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
export class TextGame extends BaseGame<TextGameInput> {
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
   * @returns Promise resolved when processing is complete.
   */
  async invoke(input: TextGameInput): Promise<void> {
    // Validate session existence and required mode.
    const sessionOption = await this.sessionsRepository.getSessionByUserId(
      input.chatId,
    );
    if (!sessionOption.isDefined) {
      await this.reportNoSession(input.chatId);
      return;
    }
    const session = sessionOption.getOrElseThrow(
      () => new Error("Missing session"),
    );
    if (!session.current.isDefined || session.mode !== TrainingMode.Write) {
      await this.reportNoSession(input.chatId);
      return;
    }

    // Normalize user input and validate it is not empty.
    const current = session.current.getOrElseThrow(
      () => new Error("Missing current question"),
    );
    const answer = this.normalizeInput(input.text);
    if (!answer) {
      await this.metricsService.safePutMetric("InvalidAnswer", 1, {
        Reason: "empty",
        Mode: session.mode,
        Level: session.level.toUpperCase(),
      });
      await this.metricsService.safePutMetric("InvalidAnswerTotal", 1, {});
      await this.telegramService.sendMessage(
        input.chatId,
        "Ответ пустой. Напишите слово на греческом.",
      );
      return;
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

    const resultText = [
      `Вопрос ${this.currentQuestionNumber(updated)}/${this.totalQuestions(updated)}`,
      `Переведи: ${questionTerm.russian}`,
      `Ваш ответ: ${answer}`,
      `Правильный ответ: ${questionTerm.greek}`,
      isCorrect ? "✅ Верно" : "❌ Неверно",
    ].join("\n");

    // Update message, emit metrics, and progress the session.
    const resultMessageId = updated.current.flatMap(
      (question) => question.messageId,
    ).orUndefined;
    if (resultMessageId) {
      await this.telegramService.editMessageText(
        input.chatId,
        resultMessageId,
        resultText,
      );
    } else {
      await this.telegramService.sendMessage(input.chatId, resultText);
    }
    await this.metricsService.safePutMetric("QuestionAnswered", 1, {
      Mode: updated.mode,
      Level: updated.level.toUpperCase(),
      Result: isCorrect ? "correct" : "wrong",
    });
    await this.metricsService.safePutMetric("QuestionAnsweredTotal", 1, {});
    await this.metricsService.safePutMetric(
      isCorrect ? "QuestionAnsweredCorrect" : "QuestionAnsweredWrong",
      1,
      {},
    );

    // Build next question or finish the session.
    const nextPack = this.questionGenerator.createQuestion(
      data.get(session.mode),
      updated.remainingIds.toSet,
    );
    if (!nextPack) {
      await this.sessionsRepository.putSession(updated);
      await this.metricsService.safePutMetric("SessionEnd", 1, {
        Mode: updated.mode,
        Level: updated.level.toUpperCase(),
      });
      await this.metricsService.safePutMetric("SessionEndTotal", 1, {});
      await this.telegramService.sendMessage(
        input.chatId,
        `Сессия завершена. Правильных: ${updated.correctCount} из ${updated.totalAsked}.`,
      );
      await this.menuService.sendStart(input.chatId);
      return;
    }

    const nextSession = updated.copy({
      current: some(nextPack.question),
      remainingIds: nextPack.remaining.toCollection,
    });
    await this.sessionsRepository.putSession(nextSession);
    await this.sendQuestion(nextSession, terms);
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
    await this.metricsService.safePutMetric("InvalidAnswer", 1, {
      Reason: "no_session",
      Mode: "write",
      Level: "unknown",
    });
    await this.metricsService.safePutMetric("InvalidAnswerTotal", 1, {});
    await this.telegramService.sendMessage(
      chatId,
      "Нет активной тренировки. Напишите /start.",
    );
  }
}
