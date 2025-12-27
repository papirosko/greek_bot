import { safePutMetric } from "./metrics";
import { GoogleSpreadsheetsService } from "./sheets";
import { Session, SessionId, SessionsRepository } from "./sessions";
import { TelegramKeyboard, TelegramService } from "./telegram";
import {
  TelegramKeyboardButton,
  TelegramUpdateMessage,
} from "./telegram-types";
import { TrainingMode } from "./training";
import { createQuestion } from "./question-generator";

/**
 * Логика тренировки: вопросы, ответы, сессии.
 */
export class Quiz {
  private readonly modeKeyboard = TelegramKeyboard.inline([
    [{ text: "Перевод (GR → RU)", callback_data: `mode:${TrainingMode.GrRu}` }],
    [{ text: "Перевод (RU → GR)", callback_data: `mode:${TrainingMode.RuGr}` }],
    [
      {
        text: "Написание (RU → GR)",
        callback_data: `mode:${TrainingMode.Write}`,
      },
    ],
  ]);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly sheetsService: GoogleSpreadsheetsService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly spreadsheetId: string,
  ) {}

  /**
   * Обрабатывает входящее обновление Telegram.
   */
  async handleUpdate(update: TelegramUpdateMessage) {
    return await update.message
      .flatMap((message) => message.chat.map((chat) => chat.id))
      .mapPromise(async (chatId) => {
        await update.message
          .flatMap((message) => message.text)
          .map((text) => text.trim().toLowerCase())
          .mapPromise(async (normalized) => {
            if (
              normalized === "/start" ||
              normalized === "/menu" ||
              normalized === "/end" ||
              normalized === "завершить"
            ) {
              await this.clearActiveSession(chatId);
              await this.handleStart(chatId);
            } else if (!normalized.startsWith("/")) {
              await this.handleTextAnswer(chatId, normalized);
            } else {
              await this.telegramService.sendMessage(
                chatId,
                "Пока поддерживается команда /start.",
              );
            }
          });

        await this.handleCallback(update).getOrElse(() => Promise.resolve());
      });
  }

  private buildLevelKeyboard(mode: TrainingMode) {
    return TelegramKeyboard.inline([
      [
        { text: "A1", callback_data: `level:a1|mode:${mode}` },
        { text: "A2", callback_data: `level:a2|mode:${mode}` },
      ],
      [
        { text: "B1", callback_data: `level:b1|mode:${mode}` },
        { text: "B2", callback_data: `level:b2|mode:${mode}` },
      ],
    ]);
  }

  private buildOptionsKeyboard(sessionId: string, options: string[]) {
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

  private totalQuestions(session: Session) {
    return (
      session.totalCount ??
      session.totalAsked +
        session.remainingIds.length +
        (session.current ? 1 : 0)
    );
  }

  private currentQuestionNumber(session: Session) {
    return session.totalAsked + 1;
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

  private buildPrompt(
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

  private async sendQuestion(
    session: Session,
    terms: { greek: string; russian: string }[],
  ) {
    if (!session.current) {
      return;
    }
    const questionTerm = terms[session.current.verbId];
    const optionTexts =
      session.mode === TrainingMode.RuGr
        ? session.current.options.map((id) => terms[id].greek)
        : session.current.options.map((id) => terms[id].russian);
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

    const messageId = response.result?.message_id;
    if (messageId && session.current) {
      const updated = session.copy({
        current: session.current.copy({ messageId }),
      });
      await this.sessionsRepository.putSession(updated);
    }
  }

  private handleStart(chatId: number) {
    return this.telegramService.sendMessage(
      chatId,
      "Выберите режим тренировки:",
      this.modeKeyboard,
    );
  }

  private handleMode(
    chatId: number,
    messageId: number,
    callbackId: string,
    mode: TrainingMode,
  ) {
    return Promise.all([
      this.telegramService.answerCallback(callbackId),
      this.telegramService.editMessageText(
        chatId,
        messageId,
        `Режим: ${this.formatModeLabel(mode)}. Выберите уровень:`,
        this.buildLevelKeyboard(mode),
      ),
    ]);
  }

  private formatModeLabel(mode: TrainingMode) {
    if (mode === TrainingMode.RuGr) {
      return "Перевод (RU → GR)";
    }
    if (mode === TrainingMode.Write) {
      return "Написание (RU → GR)";
    }
    return "Перевод (GR → RU)";
  }

  private async handleLevel(
    chatId: number,
    messageId: number,
    callbackId: string,
    level: string,
    mode: TrainingMode,
  ) {
    await Promise.all([
      this.telegramService.answerCallback(callbackId),
      this.telegramService.editMessageText(
        chatId,
        messageId,
        `Выбран ${this.formatModeLabel(mode)} уровень ${level.toUpperCase()}.`,
      ),
    ]);

    const data = await this.sheetsService.loadDataBase(
      this.spreadsheetId,
      level.toUpperCase(),
    );
    const terms = data.get(mode).toArray;
    if (terms.length < 4) {
      await this.telegramService.sendMessage(
        chatId,
        "Недостаточно глаголов для тренировки.",
      );
      return;
    }

    const ids = terms.map((_, index) => index);
    const session = this.createSession(chatId, level, mode, ids);
    const questionPack = createQuestion(terms, session.remainingIds);
    if (!questionPack) {
      await this.telegramService.sendMessage(
        chatId,
        "Не удалось сформировать вопрос.",
      );
      return;
    }

    const updated = session.copy({
      current: questionPack.question,
      remainingIds: questionPack.remaining,
    });
    await this.sessionsRepository.putSession(updated);
    await safePutMetric("SessionStart", 1, {
      Mode: updated.mode,
      Level: updated.level.toUpperCase(),
    });
    await safePutMetric("SessionStartTotal", 1, {});
    await this.sendQuestion(updated, terms);
  }

  private async handleAnswer(
    chatId: number,
    messageId: number,
    callbackId: string,
    sessionId: string,
    answerIndex: number,
  ) {
    const session = await this.sessionsRepository.getSession(sessionId);
    if (!session || !session.current) {
      await Promise.all([
        this.telegramService.answerCallback(callbackId),
        this.telegramService.sendMessage(
          chatId,
          "Сессия не найдена. Начните заново через /start.",
        ),
      ]);
      return;
    }

    if (session.current.messageId && session.current.messageId !== messageId) {
      await Promise.all([
        this.telegramService.answerCallback(callbackId),
        this.telegramService.sendMessage(
          chatId,
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
    const questionTerm = terms[session.current.verbId];
    const selectedId = session.current.options[answerIndex];
    const selectedTerm = terms[selectedId];
    const correctTerm =
      terms[session.current.options[session.current.correctIndex]];
    const selectedText =
      session.mode === TrainingMode.RuGr
        ? selectedTerm.greek
        : selectedTerm.russian;
    const correctText =
      session.mode === TrainingMode.RuGr
        ? correctTerm.greek
        : correctTerm.russian;

    const isCorrect = answerIndex === session.current.correctIndex;
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
      this.telegramService.answerCallback(callbackId),
      this.telegramService.editMessageText(chatId, messageId, resultText),
    ]);
    await safePutMetric("QuestionAnswered", 1, {
      Mode: updated.mode,
      Level: updated.level.toUpperCase(),
      Result: isCorrect ? "correct" : "wrong",
    });
    await safePutMetric("QuestionAnsweredTotal", 1, {});
    await safePutMetric(
      isCorrect ? "QuestionAnsweredCorrect" : "QuestionAnsweredWrong",
      1,
      {},
    );

    const nextPack = createQuestion(terms, updated.remainingIds);
    if (!nextPack) {
      await this.sessionsRepository.putSession(updated);
      await safePutMetric("SessionEnd", 1, {
        Mode: updated.mode,
        Level: updated.level.toUpperCase(),
      });
      await safePutMetric("SessionEndTotal", 1, {});
      await this.telegramService.sendMessage(
        chatId,
        `Сессия завершена. Правильных: ${updated.correctCount} из ${updated.totalAsked}.`,
      );
      await this.handleStart(chatId);
      return;
    }

    const nextSession = updated.copy({
      current: nextPack.question,
      remainingIds: nextPack.remaining,
    });
    await this.sessionsRepository.putSession(nextSession);
    await this.sendQuestion(nextSession, terms);
  }

  private async handleTextAnswer(chatId: number, text: string) {
    const session = await this.sessionsRepository.getSessionByUserId(chatId);
    if (!session || !session.current || session.mode !== TrainingMode.Write) {
      await safePutMetric("InvalidAnswer", 1, {
        Reason: "no_session",
        Mode: "write",
        Level: "unknown",
      });
      await safePutMetric("InvalidAnswerTotal", 1, {});
      return this.telegramService.sendMessage(
        chatId,
        "Нет активной тренировки. Напишите /start.",
      );
    }

    const answer = this.normalizeInput(text);
    if (!answer) {
      await safePutMetric("InvalidAnswer", 1, {
        Reason: "empty",
        Mode: session.mode,
        Level: session.level.toUpperCase(),
      });
      await safePutMetric("InvalidAnswerTotal", 1, {});
      return this.telegramService.sendMessage(
        chatId,
        "Ответ пустой. Напишите слово на греческом.",
      );
    }

    const data = await this.sheetsService.loadDataBase(
      this.spreadsheetId,
      session.level.toUpperCase(),
    );
    const terms = data.get(session.mode).toArray;
    const questionTerm = terms[session.current.verbId];
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

    if (updated.current?.messageId) {
      await this.telegramService.editMessageText(
        chatId,
        updated.current.messageId,
        resultText,
      );
    } else {
      await this.telegramService.sendMessage(chatId, resultText);
    }
    await safePutMetric("QuestionAnswered", 1, {
      Mode: updated.mode,
      Level: updated.level.toUpperCase(),
      Result: isCorrect ? "correct" : "wrong",
    });
    await safePutMetric("QuestionAnsweredTotal", 1, {});
    await safePutMetric(
      isCorrect ? "QuestionAnsweredCorrect" : "QuestionAnsweredWrong",
      1,
      {},
    );

    const nextPack = createQuestion(terms, updated.remainingIds);
    if (!nextPack) {
      await this.sessionsRepository.putSession(updated);
      await safePutMetric("SessionEnd", 1, {
        Mode: updated.mode,
        Level: updated.level.toUpperCase(),
      });
      await safePutMetric("SessionEndTotal", 1, {});
      await this.telegramService.sendMessage(
        chatId,
        `Сессия завершена. Правильных: ${updated.correctCount} из ${updated.totalAsked}.`,
      );
      await this.handleStart(chatId);
      return;
    }

    const nextSession = updated.copy({
      current: nextPack.question,
      remainingIds: nextPack.remaining,
    });
    await this.sessionsRepository.putSession(nextSession);
    await this.sendQuestion(nextSession, terms);
  }

  private handleCallback(update: TelegramUpdateMessage) {
    return update.callbackQuery
      .flatMap((query) =>
        query.message.flatMap((message) =>
          message.chat.flatMap((chat) =>
            message.messageId.map((messageId) => ({
              chatId: chat.id,
              messageId,
              callbackId: query.id,
              data: query.data.getOrElseValue(""),
            })),
          ),
        ),
      )
      .map(({ chatId, messageId, callbackId, data }) => {
        if (data.startsWith("mode:")) {
          const mode = data.split(":")[1] as TrainingMode;
          const selectedMode = Object.values(TrainingMode).includes(mode)
            ? mode
            : TrainingMode.GrRu;
          return this.handleMode(chatId, messageId, callbackId, selectedMode);
        }
        const levelMatch = data.match(
          /^level:([a-z0-9]+)\|mode:(ru-gr|gr-ru|write)$/,
        );
        if (levelMatch) {
          return this.handleLevel(
            chatId,
            messageId,
            callbackId,
            levelMatch[1],
            levelMatch[2] as TrainingMode,
          );
        }
        const answerMatch = data.match(/^s=([^&]+)&a=(\\d+)$/);
        if (answerMatch) {
          return this.handleAnswer(
            chatId,
            messageId,
            callbackId,
            answerMatch[1],
            Number(answerMatch[2]),
          );
        }
        return this.telegramService.answerCallback(callbackId);
      });
  }

  private async clearActiveSession(userId: number) {
    const active = await this.sessionsRepository.getSessionByUserId(userId);
    if (active) {
      await this.sessionsRepository.deleteSession(active.sessionId);
    }
  }

  private createSession(
    userId: number,
    level: string,
    mode: TrainingMode,
    remainingIds: number[],
  ) {
    return new Session(
      SessionId.next(),
      userId,
      level,
      mode,
      remainingIds,
      0,
      0,
      remainingIds.length,
      undefined,
      Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      Math.floor(Date.now() / 1000),
    );
  }
}
