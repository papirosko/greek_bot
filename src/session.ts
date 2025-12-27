import { Collection, Option, option } from "scats";
import { SessionQuestion, SessionQuestionItem } from "./session-question";
import { TrainingMode } from "./training";

export type SessionItem = {
  sessionId: string;
  userId: number;
  level: string;
  mode: TrainingMode;
  remainingIds: number[];
  totalAsked: number;
  correctCount: number;
  totalCount: number;
  current?: SessionQuestionItem;
  expiresAt: number;
  updatedAt: number;
};

/**
 * Сессия тренировки пользователя.
 */
export class Session {
  /**
   * @param sessionId идентификатор сессии
   * @param userId Telegram user id
   * @param level уровень (A1/A2/B1/B2)
   * @param mode режим тренировки
   * @param remainingIds индексы терминов, которые еще не заданы
   * @param totalAsked число заданных вопросов
   * @param correctCount число правильных ответов
   * @param totalCount общее число вопросов в сессии
   * @param current текущий вопрос
   * @param expiresAt время истечения сессии (unix time)
   * @param updatedAt время последнего обновления (unix time)
   */
  constructor(
    readonly sessionId: string,
    readonly userId: number,
    readonly level: string,
    readonly mode: TrainingMode,
    readonly remainingIds: Collection<number>,
    readonly totalAsked: number,
    readonly correctCount: number,
    readonly totalCount: number,
    readonly current: Option<SessionQuestion>,
    readonly expiresAt: number,
    readonly updatedAt: number,
  ) {}

  /**
   * Возвращает копию с частичными изменениями.
   */
  copy(o: Partial<Session>) {
    return new Session(
      option(o.sessionId).getOrElseValue(this.sessionId),
      option(o.userId).getOrElseValue(this.userId),
      option(o.level).getOrElseValue(this.level),
      option(o.mode).getOrElseValue(this.mode),
      option<Collection<number>>(o.remainingIds).getOrElseValue(
        this.remainingIds,
      ),
      option(o.totalAsked).getOrElseValue(this.totalAsked),
      option(o.correctCount).getOrElseValue(this.correctCount),
      option(o.totalCount).getOrElseValue(this.totalCount),
      option<Option<SessionQuestion>>(o.current).getOrElseValue(this.current),
      option(o.expiresAt).getOrElseValue(this.expiresAt),
      option(o.updatedAt).getOrElseValue(this.updatedAt),
    );
  }

  /**
   * Возвращает plain-объект для сохранения в хранилище.
   */
  get item(): SessionItem {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      level: this.level,
      mode: this.mode,
      remainingIds: this.remainingIds.toArray,
      totalAsked: this.totalAsked,
      correctCount: this.correctCount,
      totalCount: this.totalCount,
      current: this.current.map((question) => question.item).orUndefined,
      expiresAt: this.expiresAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Создает сессию из произвольного JSON.
   */
  static fromJson(payload: unknown): Session {
    const asObject = (value: unknown) =>
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const obj = asObject(payload);
    const remainingIds = Array.isArray(obj.remainingIds)
      ? obj.remainingIds.map((value) => Number(value))
      : [];

    return new Session(
      String(obj.sessionId ?? ""),
      Number(obj.userId ?? 0),
      String(obj.level ?? ""),
      (obj.mode ?? TrainingMode.GrRu) as TrainingMode,
      new Collection(remainingIds),
      Number(obj.totalAsked ?? 0),
      Number(obj.correctCount ?? 0),
      Number(obj.totalCount ?? remainingIds.length),
      option(obj.current).map((raw) => SessionQuestion.fromJson(raw)),
      Number(obj.expiresAt ?? 0),
      Number(obj.updatedAt ?? 0),
    );
  }
}
