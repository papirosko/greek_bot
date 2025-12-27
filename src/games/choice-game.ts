import { Option, option, some } from "scats";
import { GoogleSpreadsheetsService } from "../sheets";
import { MetricsService } from "../metrics";
import { BaseGame } from "./base-game";
import { ChoiceGameInput } from "./choice-game-input";
import { TelegramUpdateMessage } from "../telegram-types";
import { TrainingMode } from "../training";
import { TelegramService } from "../telegram";
import { SessionsRepository } from "../sessions.repository";
import { QuestionGenerator } from "../question-generator";
import { MenuService } from "../menu-service";

/**
 * Multiple-choice game implementation.
 */
export class ChoiceGame extends BaseGame<ChoiceGameInput> {
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
   * Builds a choice-game input from a Telegram update.
   * @param update Incoming Telegram update DTO.
   * @returns Option with parsed choice input, or none.
   */
  buildInput(update: TelegramUpdateMessage): Option<ChoiceGameInput> {
    return update.callbackQuery.flatMap((query) => {
      const matchOption = query.data.flatMap((data) =>
        option(data.match(/^s=([^&]+)&a=(\d+)$/)),
      );
      return matchOption.flatMap((match) =>
        query.message.flatMap((message) =>
          message.chat.flatMap((chat) =>
            message.messageId.map(
              (messageId) =>
                new ChoiceGameInput(
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
   * Handles a single answer selection.
   * @param input Parsed choice game input.
   * @returns Promise resolved when processing is complete.
   */
  async invoke(input: ChoiceGameInput): Promise<void> {
    // Validate session existence and current question.
    const sessionOption = await this.sessionsRepository.getSession(
      input.sessionId,
    );
    if (!sessionOption.isDefined) {
      await Promise.all([
        this.telegramService.answerCallback(input.callbackId),
        this.telegramService.sendMessage(
          input.chatId,
          "Сессия не найдена. Начните заново через /start.",
        ),
      ]);
      return;
    }
    const session = sessionOption.getOrElseThrow(
      () => new Error("Missing session"),
    );
    if (!session.current.isDefined) {
      await Promise.all([
        this.telegramService.answerCallback(input.callbackId),
        this.telegramService.sendMessage(
          input.chatId,
          "Сессия не найдена. Начните заново через /start.",
        ),
      ]);
      return;
    }

    // Ensure the callback refers to the active message.
    const current = session.current.getOrElseThrow(
      () => new Error("Missing current question"),
    );
    if (current.messageId.exists((id) => id !== input.messageId)) {
      await Promise.all([
        this.telegramService.answerCallback(input.callbackId),
        this.telegramService.sendMessage(
          input.chatId,
          "Этот вопрос уже не активен. Начните заново через /start.",
        ),
      ]);
      return;
    }

    // Load terms and compute result payload.
    const data = await this.sheetsService.loadDataBase(
      this.spreadsheetId,
      session.level.toUpperCase(),
    );
    const terms = data.get(session.mode).toArray;
    const questionTerm = terms[current.verbId];
    const selectedId = current.options.get(input.answerIndex);
    const selectedTerm = terms[selectedId];
    const correctTerm = terms[current.options.get(current.correctIndex)];
    const selectedText =
      session.mode === TrainingMode.RuGr
        ? selectedTerm.greek
        : selectedTerm.russian;
    const correctText =
      session.mode === TrainingMode.RuGr
        ? correctTerm.greek
        : correctTerm.russian;

    const isCorrect = input.answerIndex === current.correctIndex;
    const updated = session.copy({
      totalAsked: session.totalAsked + 1,
      correctCount: session.correctCount + (isCorrect ? 1 : 0),
    });

    const resultText = [
      `Вопрос ${this.currentQuestionNumber(updated)}/${this.totalQuestions(updated)}`,
      updated.mode === TrainingMode.RuGr || updated.mode === TrainingMode.Write
        ? `Переведи: ${questionTerm.russian}`
        : `Переведи: ${questionTerm.greek}`,
      `Ваш ответ: ${selectedText}`,
      `Правильный ответ: ${correctText}`,
      isCorrect ? "✅ Верно" : "❌ Неверно",
    ].join("\n");

    // Update message, emit metrics, and progress the session.
    await Promise.all([
      this.telegramService.answerCallback(input.callbackId),
      this.telegramService.editMessageText(
        input.chatId,
        input.messageId,
        resultText,
      ),
    ]);
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
}
