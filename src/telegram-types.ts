import { Option, option } from "scats";

/**
 * Чат Telegram.
 */
export class TelegramChat {
  /**
   * @param id идентификатор чата
   */
  constructor(readonly id: number) {}

  /**
   * Возвращает копию с частичными изменениями.
   */
  copy(o: Partial<TelegramChat>) {
    return new TelegramChat(option(o.id).getOrElseValue(this.id));
  }
}

/**
 * Сообщение Telegram.
 */
export class TelegramMessage {
  /**
   * @param chat чат сообщения
   * @param text текст сообщения
   * @param messageId id сообщения
   */
  constructor(
    readonly chat: Option<TelegramChat>,
    readonly text: Option<string>,
    readonly messageId: Option<number>,
  ) {}

  /**
   * Возвращает копию с частичными изменениями.
   */
  copy(o: Partial<TelegramMessage>) {
    return new TelegramMessage(
      option<Option<TelegramChat>>(o.chat).getOrElseValue(this.chat),
      option<Option<string>>(o.text).getOrElseValue(this.text),
      option<Option<number>>(o.messageId).getOrElseValue(this.messageId),
    );
  }
}

/**
 * Сообщение внутри callback-запроса.
 */
export class TelegramCallbackQueryMessage {
  /**
   * @param chat чат сообщения
   * @param messageId id сообщения
   */
  constructor(
    readonly chat: Option<TelegramChat>,
    readonly messageId: Option<number>,
  ) {}

  /**
   * Возвращает копию с частичными изменениями.
   */
  copy(o: Partial<TelegramCallbackQueryMessage>) {
    return new TelegramCallbackQueryMessage(
      option<Option<TelegramChat>>(o.chat).getOrElseValue(this.chat),
      option<Option<number>>(o.messageId).getOrElseValue(this.messageId),
    );
  }
}

/**
 * Callback-запрос от Telegram.
 */
export class TelegramCallbackQuery {
  /**
   * @param id идентификатор callback
   * @param data данные callback
   * @param message сообщение, к которому привязана кнопка
   */
  constructor(
    readonly id: string,
    readonly data: Option<string>,
    readonly message: Option<TelegramCallbackQueryMessage>,
  ) {}

  /**
   * Возвращает копию с частичными изменениями.
   */
  copy(o: Partial<TelegramCallbackQuery>) {
    return new TelegramCallbackQuery(
      option(o.id).getOrElseValue(this.id),
      option<Option<string>>(o.data).getOrElseValue(this.data),
      option<Option<TelegramCallbackQueryMessage>>(o.message).getOrElseValue(
        this.message,
      ),
    );
  }
}

/**
 * DTO для входящего обновления Telegram.
 */
export class TelegramUpdateMessage {
  /**
   * @param message входящее сообщение
   * @param callbackQuery callback-запрос
   */
  constructor(
    readonly message: Option<TelegramMessage>,
    readonly callbackQuery: Option<TelegramCallbackQuery>,
  ) {}

  /**
   * Возвращает копию с частичными изменениями.
   */
  copy(o: Partial<TelegramUpdateMessage>) {
    return new TelegramUpdateMessage(
      option<Option<TelegramMessage>>(o.message).getOrElseValue(this.message),
      option<Option<TelegramCallbackQuery>>(o.callbackQuery).getOrElseValue(
        this.callbackQuery,
      ),
    );
  }

  /**
   * Создает DTO из произвольного JSON.
   */
  static fromJson(payload: unknown) {
    const asObject = (value: unknown) =>
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

    const root = asObject(payload);

    const message = option(root.message).map((raw) => {
      const msg = asObject(raw);
      const chat = option(msg.chat).map((rawChat) => {
        const chatObj = asObject(rawChat);
        return new TelegramChat(Number(chatObj.id));
      });
      const text = option(msg.text).map((value) => String(value));
      const messageId = option(msg.message_id).map((value) => Number(value));
      return new TelegramMessage(chat, text, messageId);
    });

    const callbackQuery = option(root.callback_query).map((raw) => {
      const cb = asObject(raw);
      const messageCb = option(cb.message).map((rawMessage) => {
        const msg = asObject(rawMessage);
        const chat = option(msg.chat).map((rawChat) => {
          const chatObj = asObject(rawChat);
          return new TelegramChat(Number(chatObj.id));
        });
        const messageId = option(msg.message_id).map((value) => Number(value));
        return new TelegramCallbackQueryMessage(chat, messageId);
      });
      const id = String(cb.id ?? "");
      const data = option(cb.data).map((value) => String(value));
      return new TelegramCallbackQuery(id, data, messageCb);
    });

    return new TelegramUpdateMessage(message, callbackQuery);
  }
}

/**
 * Кнопка в inline-клавиатуре Telegram.
 */
export type TelegramKeyboardButton = {
  text: string;
  callback_data: string;
};

/**
 * Inline-клавиатура Telegram.
 */
export type TelegramInlineKeyboard = {
  inline_keyboard: TelegramKeyboardButton[][];
};

/**
 * Ответ Telegram API.
 */
export type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};
