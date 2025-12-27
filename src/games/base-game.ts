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

export abstract class BaseGame<TInput extends GameInput> {
  protected constructor(
    protected readonly telegramService: TelegramService,
    protected readonly sessionsRepository: SessionsRepository,
    protected readonly questionGenerator: QuestionGenerator,
    protected readonly menuService: MenuService,
    protected readonly spreadsheetId: string,
  ) {}

  abstract buildInput(update: TelegramUpdateMessage): Option<TInput>;

  abstract invoke(input: TInput): Promise<void>;

  protected totalQuestions(session: Session) {
    return (
      session.totalCount ??
      session.totalAsked +
        session.remainingIds.length +
        (session.current.isDefined ? 1 : 0)
    );
  }

  protected currentQuestionNumber(session: Session) {
    return session.totalAsked + 1;
  }

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

  async sendQuestion(
    session: Session,
    terms: { greek: string; russian: string }[],
  ) {
    if (!session.current.isDefined) {
      return;
    }
    const current = session.current.getOrElseThrow(
      () => new Error("Missing current question"),
    );
    const questionTerm = terms[current.verbId];
    const optionTexts =
      session.mode === TrainingMode.RuGr
        ? current.options.map((id) => terms[id].greek).toArray
        : current.options.map((id) => terms[id].russian).toArray;
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
    if (messageId) {
      const updated = session.copy({
        current: session.current.map((question) =>
          question.copy({ messageId: some(messageId) }),
        ),
      });
      await this.sessionsRepository.putSession(updated);
    }
  }

  createQuestionPack(terms: Collection<Term>, session: Session) {
    return this.questionGenerator.createQuestion(
      terms,
      session.remainingIds.toSet,
    );
  }
}
