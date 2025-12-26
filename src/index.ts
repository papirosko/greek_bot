import { Try, option } from "scats";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { answerCallback, editMessageText, keyboard, sendMessage, TelegramKeyboardButton } from "./telegram";
import { getLevelVerbs } from "./sheets";
import {
  createSession,
  deleteSession,
  getSession,
  getSessionByUserId,
  putSession,
  Session,
} from "./sessions";
import { createQuestion } from "./quiz";

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

const modeKeyboard = keyboard([
  [{ text: "Перевод (GR → RU)", callback_data: "mode:gr-ru" }],
  [{ text: "Перевод (RU → GR)", callback_data: "mode:ru-gr" }],
  [{ text: "Написание (RU → GR)", callback_data: "mode:write" }],
]);

const buildLevelKeyboard = (mode: Session["mode"]) =>
  keyboard([
    [
      { text: "A1", callback_data: `level:a1|mode:${mode}` },
      { text: "A2", callback_data: `level:a2|mode:${mode}` },
    ],
    [
      { text: "B1", callback_data: `level:b1|mode:${mode}` },
      { text: "B2", callback_data: `level:b2|mode:${mode}` },
    ],
  ]);

const parseUpdate = (event: APIGatewayProxyEventV2): TelegramUpdate => {
  if (!event.body) {
    return {} as TelegramUpdate;
  }
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf-8")
    : event.body;

  return option(rawBody)
    .map((raw) => Try(() => JSON.parse(raw)))
    .flatMap((result) => result.toOption)
    .getOrElse(() => ({})) as TelegramUpdate;
};

const buildOptionsKeyboard = (sessionId: string, options: string[]) => {
  const buttons = options.map<TelegramKeyboardButton>((text, index) => ({
    text,
    callback_data: `s=${sessionId}&a=${index}`,
  }));
  const rows: TelegramKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return keyboard(rows);
};

const totalQuestions = (session: Session) =>
  session.totalAsked + session.remainingIds.length + (session.current ? 1 : 0);

const currentQuestionNumber = (session: Session) => session.totalAsked + 1;

const normalizeInput = (value: string) => value.trim().toLowerCase();

const removeGreekAccents = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300\u0301\u0342\u0344\u0345]/g, "")
    .normalize("NFC");

const hasGreekAccent = (value: string) => /[\u0300\u0301\u0342\u0344\u0345]/.test(value.normalize("NFD"));

const matchesGreekInput = (input: string, correct: string) => {
  const normalizedInput = normalizeInput(input);
  const normalizedCorrect = normalizeInput(correct);
  if (!hasGreekAccent(normalizedInput)) {
    return removeGreekAccents(normalizedInput) === removeGreekAccents(normalizedCorrect);
  }
  return normalizedInput === normalizedCorrect;
};

const buildPrompt = (session: Session, verb: { present: string; translation: string }) => {
  if (session.mode === "ru-gr" || session.mode === "write") {
    return `Вопрос ${currentQuestionNumber(session)}/${totalQuestions(session)}\nПереведи: ${verb.translation}`;
  }
  return `Вопрос ${currentQuestionNumber(session)}/${totalQuestions(session)}\nПереведи: ${verb.present}`;
};

const sendQuestion = async (session: Session, verbs: { present: string; translation: string }[]) => {
  if (!session.current) {
    return;
  }
  const questionVerb = verbs[session.current.verbId];
  const optionTexts =
    session.mode === "ru-gr"
      ? session.current.options.map((id) => verbs[id].present)
      : session.current.options.map((id) => verbs[id].translation);
  const response =
    session.mode === "write"
      ? await sendMessage(session.userId, buildPrompt(session, questionVerb))
      : await sendMessage(
          session.userId,
          buildPrompt(session, questionVerb),
          buildOptionsKeyboard(session.sessionId, optionTexts)
        );

  const messageId = response.result?.message_id;
  if (messageId) {
    session.current.messageId = messageId;
    await putSession(session);
  }
};

const handleStart = (chatId: number) =>
  sendMessage(chatId, "Выберите режим тренировки:", modeKeyboard);

const clearActiveSession = async (userId: number) => {
  const active = await getSessionByUserId(userId);
  if (active) {
    await deleteSession(active.sessionId);
  }
};

const handleMode = (chatId: number, messageId: number, callbackId: string, mode: Session["mode"]) =>
  Promise.all([
    answerCallback(callbackId),
    editMessageText(
      chatId,
      messageId,
      `Режим: ${mode === "ru-gr" ? "RU → GR" : mode === "write" ? "Написание RU → GR" : "GR → RU"}. Выберите уровень:`,
      buildLevelKeyboard(mode)
    ),
  ]);


const handleLevel = async (
  chatId: number,
  messageId: number,
  callbackId: string,
  level: string,
  mode: Session["mode"]
) => {
  await Promise.all([
    answerCallback(callbackId),
    editMessageText(chatId, messageId, `Уровень ${level.toUpperCase()} выбран.`),
  ]);

  const verbs = await getLevelVerbs(level.toUpperCase());
  if (verbs.length < 4) {
    await sendMessage(chatId, "Недостаточно глаголов для тренировки.");
    return;
  }

  const ids = verbs.map((verb) => verb.id);
  const session = createSession(chatId, level, mode, ids);
  const questionPack = createQuestion(verbs, session.remainingIds);
  if (!questionPack) {
    await sendMessage(chatId, "Не удалось сформировать вопрос.");
    return;
  }

  session.current = questionPack.question;
  session.remainingIds = questionPack.remaining;
  await putSession(session);
  await sendQuestion(session, verbs);
};

const handleAnswer = async (
  chatId: number,
  messageId: number,
  callbackId: string,
  sessionId: string,
  answerIndex: number
) => {
  const session = await getSession(sessionId);
  if (!session || !session.current) {
    await Promise.all([
      answerCallback(callbackId),
      sendMessage(chatId, "Сессия не найдена. Начните заново через /start."),
    ]);
    return;
  }

  if (session.current.messageId && session.current.messageId !== messageId) {
    await Promise.all([
      answerCallback(callbackId),
      sendMessage(chatId, "Этот вопрос уже не активен. Начните заново через /start."),
    ]);
    return;
  }

  const verbs = await getLevelVerbs(session.level.toUpperCase());
  const questionVerb = verbs[session.current.verbId];
  const selectedId = session.current.options[answerIndex];
  const selectedVerb = verbs[selectedId];
  const correctVerb = verbs[session.current.options[session.current.correctIndex]];
  const selectedText = session.mode === "ru-gr" ? selectedVerb.present : selectedVerb.translation;
  const correctText = session.mode === "ru-gr" ? correctVerb.present : correctVerb.translation;

  const isCorrect = answerIndex === session.current.correctIndex;
  session.totalAsked += 1;
  if (isCorrect) {
    session.correctCount += 1;
  }

  const resultText = [
    `Вопрос ${currentQuestionNumber(session)}/${totalQuestions(session)}`,
    session.mode === "ru-gr" || session.mode === "write"
      ? `Переведи: ${questionVerb.translation}`
      : `Переведи: ${questionVerb.present}`,
    `Ваш ответ: ${selectedText}`,
    `Правильный ответ: ${correctText}`,
    isCorrect ? "✅ Верно" : "❌ Неверно",
  ].join("\n");

  await Promise.all([answerCallback(callbackId), editMessageText(chatId, messageId, resultText)]);

  const nextPack = createQuestion(verbs, session.remainingIds);
  if (!nextPack) {
    await putSession(session);
    await sendMessage(
      chatId,
      [
        `Сессия завершена. Правильных: ${session.correctCount} из ${session.totalAsked}.`,
        "Чтобы выбрать новый режим, напишите /end.",
      ].join("\n")
    );
    return;
  }

  session.current = nextPack.question;
  session.remainingIds = nextPack.remaining;
  await putSession(session);
  await sendQuestion(session, verbs);
};

const handleTextAnswer = async (chatId: number, text: string) => {
  const session = await getSessionByUserId(chatId);
  if (!session || !session.current || session.mode !== "write") {
    return sendMessage(chatId, "Нет активной тренировки. Напишите /start.");
  }

  const answer = normalizeInput(text);
  if (!answer) {
    return sendMessage(chatId, "Ответ пустой. Напишите слово на греческом.");
  }

  const verbs = await getLevelVerbs(session.level.toUpperCase());
  const questionVerb = verbs[session.current.verbId];
  const correctAnswer = normalizeInput(questionVerb.present);
  const isCorrect = matchesGreekInput(answer, correctAnswer);

  session.totalAsked += 1;
  if (isCorrect) {
    session.correctCount += 1;
  }

  const resultText = [
    `Вопрос ${currentQuestionNumber(session)}/${totalQuestions(session)}`,
    `Переведи: ${questionVerb.translation}`,
    `Ваш ответ: ${answer}`,
    `Правильный ответ: ${questionVerb.present}`,
    isCorrect ? "✅ Верно" : "❌ Неверно",
  ].join("\n");

  if (session.current.messageId) {
    await editMessageText(chatId, session.current.messageId, resultText);
  } else {
    await sendMessage(chatId, resultText);
  }

  const nextPack = createQuestion(verbs, session.remainingIds);
  if (!nextPack) {
    await putSession(session);
    await sendMessage(
      chatId,
      [
        `Сессия завершена. Правильных: ${session.correctCount} из ${session.totalAsked}.`,
        "Чтобы выбрать новый режим, напишите /start.",
      ].join("\n")
    );
    return;
  }

  session.current = nextPack.question;
  session.remainingIds = nextPack.remaining;
  await putSession(session);
  await sendQuestion(session, verbs);
};

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
      if (data === "mode:ru-gr" || data === "mode:gr-ru" || data === "mode:write") {
        const mode = (data.split(":")[1] ?? "gr-ru") as Session["mode"];
        return handleMode(chatId, messageId, callbackId, mode);
      }
      const levelMatch = data.match(/^level:([a-z0-9]+)\|mode:(ru-gr|gr-ru|write)$/);
      if (levelMatch) {
        return handleLevel(chatId, messageId, callbackId, levelMatch[1], levelMatch[2] as Session["mode"]);
      }
      const answerMatch = data.match(/^s=([^&]+)&a=(\d+)$/);
      if (answerMatch) {
        return handleAnswer(chatId, messageId, callbackId, answerMatch[1], Number(answerMatch[2]));
      }
      return answerCallback(callbackId);
    });

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const update = parseUpdate(event);
  const chatId = update.message?.chat?.id;

  if (chatId) {
    const text = update.message?.text ?? "";
    const normalized = text.trim().toLowerCase();
    if (normalized === "/start" || normalized === "/menu" || normalized === "/end" || normalized === "завершить") {
      await clearActiveSession(chatId);
      await handleStart(chatId);
    } else if (!normalized.startsWith("/")) {
      await handleTextAnswer(chatId, text);
    } else {
      await sendMessage(chatId, "Пока поддерживается команда /start.");
    }
  }

  await handleCallback(update).getOrElse(() => Promise.resolve());

  return { statusCode: 200, body: "ok" };
};
