import https from "https";
import { Collection, Try, option } from "scats";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      chat?: { id?: number };
      message_id?: number;
    };
  };
};

type TelegramKeyboardButton = {
  text: string;
  callback_data: string;
};

type TelegramInlineKeyboard = {
  inline_keyboard: TelegramKeyboardButton[][];
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

const telegramRequest = (method: string, payload: Record<string, unknown>) =>
  new Promise((resolve, reject) => {
    if (!TELEGRAM_TOKEN) {
      return reject(new Error("Missing TELEGRAM_TOKEN"));
    }

    const body = JSON.stringify(payload);
    const req = https.request(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`,
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
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });

const sendMessage = (chatId: number, text: string, keyboard?: TelegramInlineKeyboard) =>
  telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: keyboard,
  });

const editMessageText = (
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

const answerCallback = (callbackQueryId: string) =>
  telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
  });

const keyboard = (buttons: TelegramKeyboardButton[]): TelegramInlineKeyboard => ({
  inline_keyboard: new Collection(buttons).map((button) => [button]).toArray,
});

const modeKeyboard = keyboard([
  { text: "Перевод (GR → RU)", callback_data: "mode:translate" },
]);

const levelKeyboard = keyboard([
  { text: "A1", callback_data: "level:a1" },
  { text: "A2", callback_data: "level:a2" },
  { text: "B1", callback_data: "level:b1" },
  { text: "B2", callback_data: "level:b2" },
]);

const parseUpdate = (event: APIGatewayProxyEventV2): TelegramUpdate => {
  const body = option(event.body)
    .map((raw) => Try(() => JSON.parse(raw)))
    .flatMap((result) => result.toOption)
    .getOrElse(() => ({}));
  return body as TelegramUpdate;
};

const handleStart = (chatId: number) =>
  sendMessage(chatId, "Выберите режим тренировки:", modeKeyboard);

const handleMode = (chatId: number, messageId: number, callbackId: string) =>
  Promise.all([
    answerCallback(callbackId),
    editMessageText(chatId, messageId, "Режим: Перевод. Выберите уровень:", levelKeyboard),
  ]);

const handleLevel = (chatId: number, messageId: number, callbackId: string, level: string) =>
  Promise.all([
    answerCallback(callbackId),
    editMessageText(chatId, messageId, `Уровень ${level.toUpperCase()} выбран.`),
    sendMessage(chatId, "Скоро появится первый вопрос."),
  ]);

const handleCallback = (update: TelegramUpdate) =>
  option(update.callback_query)
    .flatMap((query) =>
      option(query.message?.chat?.id)
        .flatMap((chatId) =>
          option(query.message?.message_id).map((messageId) => ({
            chatId,
            messageId,
            callbackId: query.id,
            data: query.data ?? "",
          }))
        )
    )
    .map(({ chatId, messageId, callbackId, data }) => {
      if (data === "mode:translate") {
        return handleMode(chatId, messageId, callbackId);
      }
      if (data.startsWith("level:")) {
        const level = data.split(":")[1] ?? "";
        return handleLevel(chatId, messageId, callbackId, level);
      }
      return answerCallback(callbackId);
    });

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const update = parseUpdate(event);

  await option(update.message?.chat?.id)
    .map((chatId) => {
      const text = update.message?.text ?? "";
      if (text === "/start") {
        return handleStart(chatId);
      }
      return sendMessage(chatId, "Пока поддерживается только /start.");
    })
    .getOrElse(() => Promise.resolve());

  await handleCallback(update).getOrElse(() => Promise.resolve());

  return { statusCode: 200, body: "ok" };
};
