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

export class ChoiceGame extends BaseGame<ChoiceGameInput> {
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

  async invoke(input: ChoiceGameInput): Promise<void> {
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
