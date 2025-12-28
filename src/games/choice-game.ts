import { Collection, Option, option, some } from "scats";
import { Action, GameRenderPayload } from "../action";
import { GoogleSpreadsheetsService } from "../sheets";
import { MetricsService } from "../metrics";
import { LeveledBaseGame } from "./leveled-base-game";
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
export class ChoiceGame extends LeveledBaseGame<ChoiceGameInput> {
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
   * @returns Collection of renderable actions.
   */
  async invoke(input: ChoiceGameInput): Promise<Collection<Action>> {
    // Validate session existence and current question.
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

    // Ensure the callback refers to the active message.
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
    const promptTerm =
      updated.mode === TrainingMode.RuGr || updated.mode === TrainingMode.Write
        ? questionTerm.russian
        : questionTerm.greek;

    // Update message, emit metrics, and progress the session.
    const resultActions = Collection.of(
      Action.answerCallback({ callbackId: input.callbackId }),
      Action.updateLastMessage({
        chatId: input.chatId,
        messageId: input.messageId,
        action: "renderAnswerResult",
        currentQuestionIndex: this.currentQuestionNumber(updated),
        totalQuestions: this.totalQuestions(updated),
        term: promptTerm,
        answerText: selectedText,
        correctText,
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
   * Builds render data for choice-game actions.
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
      const keyboard = this.buildOptionsKeyboard(
        payload.sessionId,
        payload.options ?? [],
      );
      return {
        text: `Вопрос ${payload.currentQuestionIndex}/${payload.totalQuestions}\nПереведи: ${payload.term}`,
        keyboard,
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
}
