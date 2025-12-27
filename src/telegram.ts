import https from "https";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  TelegramInlineKeyboard,
  TelegramKeyboardButton,
  TelegramResponse,
  TelegramUpdateMessage,
} from "./telegram-types";

/**
 * Клиент для вызовов Telegram Bot API.
 */
export class TelegramService {
  /**
   * @param token Telegram bot token.
   */
  constructor(private readonly token: string) {}

  /**
   * Преобразует входящий event из API Gateway в TelegramUpdateMessage.
   * @param event API Gateway event payload.
   * @returns Parsed Telegram update DTO.
   */
  parseUpdate(event: APIGatewayProxyEventV2): TelegramUpdateMessage {
    if (!event.body) {
      return TelegramUpdateMessage.fromJson({});
    }
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body;
    try {
      return TelegramUpdateMessage.fromJson(JSON.parse(rawBody));
    } catch {
      return TelegramUpdateMessage.fromJson({});
    }
  }

  /**
   * Отправляет сообщение в чат.
   * @param chatId Telegram chat id.
   * @param text Message text.
   * @param keyboard Optional inline keyboard.
   * @returns Telegram API response with message id.
   */
  sendMessage(chatId: number, text: string, keyboard?: TelegramInlineKeyboard) {
    return this.request<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: keyboard,
    });
  }

  /**
   * Редактирует текст сообщения.
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id.
   * @param text Updated message text.
   * @param keyboard Optional inline keyboard.
   * @returns Telegram API response.
   */
  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    keyboard?: TelegramInlineKeyboard,
  ) {
    return this.request("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: keyboard,
    });
  }

  /**
   * Подтверждает callback-кнопку.
   * @param callbackQueryId Callback query id.
   * @returns Telegram API response.
   */
  answerCallback(callbackQueryId: string) {
    return this.request("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
    });
  }

  /**
   * Sends a POST request to the Telegram API.
   * @param method Telegram API method name.
   * @param payload Request payload.
   * @returns Telegram API response.
   */
  private request<T>(method: string, payload: Record<string, unknown>) {
    // Ensure bot token is provided.
    if (!this.token) {
      throw new Error("Missing TELEGRAM_TOKEN");
    }
    // Serialize payload before sending.
    const body = JSON.stringify(payload);
    return new Promise<TelegramResponse<T>>((resolve, reject) => {
      // Send HTTPS request and parse JSON response.
      const req = https.request(
        `https://api.telegram.org/bot${this.token}/${method}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data) as TelegramResponse<T>;
              resolve(parsed);
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

/**
 * Утилиты для работы с клавиатурами.
 */
export class TelegramKeyboard {
  /**
   * Создает inline-клавиатуру из рядов кнопок.
   * @param rows Button rows.
   * @returns Inline keyboard payload.
   */
  static inline(rows: TelegramKeyboardButton[][]): TelegramInlineKeyboard {
    return { inline_keyboard: rows };
  }
}
