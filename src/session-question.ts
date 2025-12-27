import { Collection, Option, option } from "scats";

export type SessionQuestionItem = {
  verbId: number;
  options: number[];
  correctIndex: number;
  messageId?: number;
};

/**
 * Вопрос текущей сессии с индексами вариантов.
 */
export class SessionQuestion {
  /**
   * @param verbId индекс правильного термина в массиве
   * @param options индексы вариантов ответа
   * @param correctIndex индекс правильного ответа внутри options
   * @param messageId id сообщения с вопросом
   */
  constructor(
    readonly verbId: number,
    readonly options: Collection<number>,
    readonly correctIndex: number,
    readonly messageId: Option<number>,
  ) {}

  /**
   * Возвращает копию с частичными изменениями.
   */
  copy(o: Partial<SessionQuestion>) {
    return new SessionQuestion(
      option(o.verbId).getOrElseValue(this.verbId),
      option<Collection<number>>(o.options).getOrElseValue(this.options),
      option(o.correctIndex).getOrElseValue(this.correctIndex),
      option<Option<number>>(o.messageId).getOrElseValue(this.messageId),
    );
  }

  /**
   * Создает вопрос из произвольного JSON.
   */
  static fromJson(payload: unknown) {
    const asObject = (value: unknown) =>
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const obj = asObject(payload);
    const options = Array.isArray(obj.options)
      ? obj.options.map((value) => Number(value))
      : [];
    const messageId = option(obj.messageId).map((value) => Number(value));

    return new SessionQuestion(
      Number(obj.verbId ?? 0),
      new Collection(options),
      Number(obj.correctIndex ?? 0),
      messageId,
    );
  }

  /**
   * Возвращает plain-объект для сохранения в хранилище.
   */
  get item(): SessionQuestionItem {
    return {
      verbId: this.verbId,
      options: this.options.toArray,
      correctIndex: this.correctIndex,
      messageId: this.messageId.orUndefined,
    };
  }
}
