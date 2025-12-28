import { Collection, Option, option } from "scats";

export type SessionQuestionItem = {
  verbId: number;
  options: number[];
  correctIndex: number;
  messageId?: number;
  promptText?: string;
  questionText?: string;
  answerOptions?: string[];
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
    readonly promptText: Option<string>,
    readonly questionText: Option<string>,
    readonly answerOptions: Option<Collection<string>>,
  ) {}

  /**
   * Возвращает копию с частичными изменениями.
   * @param o Partial updates.
   * @returns New SessionQuestion instance.
   */
  copy(o: Partial<SessionQuestion>) {
    return new SessionQuestion(
      option(o.verbId).getOrElseValue(this.verbId),
      option<Collection<number>>(o.options).getOrElseValue(this.options),
      option(o.correctIndex).getOrElseValue(this.correctIndex),
      option<Option<number>>(o.messageId).getOrElseValue(this.messageId),
      option<Option<string>>(o.promptText).getOrElseValue(this.promptText),
      option<Option<string>>(o.questionText).getOrElseValue(this.questionText),
      option<Option<Collection<string>>>(o.answerOptions).getOrElseValue(
        this.answerOptions,
      ),
    );
  }

  /**
   * Создает вопрос из произвольного JSON.
   * @param payload Raw JSON payload.
   * @returns Parsed SessionQuestion instance.
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
    const promptText = option(obj.promptText).map((value) => String(value));
    const questionText = option(obj.questionText).map((value) => String(value));
    const answerOptions = Array.isArray(obj.answerOptions)
      ? option(new Collection(obj.answerOptions.map((value) => String(value))))
      : option<Collection<string>>(undefined);

    return new SessionQuestion(
      Number(obj.verbId ?? 0),
      new Collection(options),
      Number(obj.correctIndex ?? 0),
      messageId,
      promptText,
      questionText,
      answerOptions,
    );
  }

  /**
   * Возвращает plain-объект для сохранения в хранилище.
   * @returns Serializable representation.
   */
  get item(): SessionQuestionItem {
    return {
      verbId: this.verbId,
      options: this.options.toArray,
      correctIndex: this.correctIndex,
      messageId: this.messageId.orUndefined,
      promptText: this.promptText.orUndefined,
      questionText: this.questionText.orUndefined,
      answerOptions: this.answerOptions.map((items) => items.toArray)
        .orUndefined,
    };
  }
}
