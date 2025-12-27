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

export class TextGame extends BaseGame<TextGameInput> {
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

  buildInput(update: TelegramUpdateMessage): Option<TextGameInput> {
    return update.message.flatMap((message) =>
      message.chat.flatMap((chat) =>
        message.text.map((text) => new TextGameInput(chat.id, text)),
      ),
    );
  }

  async invoke(input: TextGameInput): Promise<void> {
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

  private normalizeInput(value: string) {
    return value.trim().toLowerCase();
  }

  private removeGreekAccents(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300\u0301\u0342\u0344\u0345]/g, "")
      .normalize("NFC");
  }

  private hasGreekAccent(value: string) {
    return /[\u0300\u0301\u0342\u0344\u0345]/.test(value.normalize("NFD"));
  }

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
