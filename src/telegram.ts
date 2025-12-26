import https from "https";
import { config } from "./config";

export type TelegramKeyboardButton = {
  text: string;
  callback_data: string;
};

export type TelegramInlineKeyboard = {
  inline_keyboard: TelegramKeyboardButton[][];
};

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

const telegramRequest = async <T>(method: string, payload: Record<string, unknown>) => {
  if (!config.telegramToken) {
    throw new Error("Missing TELEGRAM_TOKEN");
  }

  const body = JSON.stringify(payload);
  return new Promise<TelegramResponse<T>>((resolve, reject) => {
    const req = https.request(
      `https://api.telegram.org/bot${config.telegramToken}/${method}`,
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
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

export const sendMessage = (chatId: number, text: string, keyboard?: TelegramInlineKeyboard) =>
  telegramRequest<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: keyboard,
  });

export const editMessageText = (
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: TelegramInlineKeyboard
) =>
  telegramRequest("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: keyboard,
  });

export const answerCallback = (callbackQueryId: string) =>
  telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
  });

export const keyboard = (rows: TelegramKeyboardButton[][]): TelegramInlineKeyboard => ({
  inline_keyboard: rows,
});
