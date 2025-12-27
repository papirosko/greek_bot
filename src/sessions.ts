import crypto from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { option } from "scats";
import { TrainingMode } from "./training";

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
    readonly options: number[],
    readonly correctIndex: number,
    readonly messageId?: number,
  ) {}

  /**
   * Возвращает копию с частичными изменениями.
   */
  copy(o: Partial<SessionQuestion>) {
    return new SessionQuestion(
      option(o.verbId).getOrElseValue(this.verbId),
      option(o.options).getOrElseValue(this.options),
      option(o.correctIndex).getOrElseValue(this.correctIndex),
      option<number | undefined>(o.messageId).getOrElseValue(this.messageId),
    );
  }
}

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
    readonly remainingIds: number[],
    readonly totalAsked: number,
    readonly correctCount: number,
    readonly totalCount: number,
    readonly current: SessionQuestion | undefined,
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
      option(o.remainingIds).getOrElseValue(this.remainingIds),
      option(o.totalAsked).getOrElseValue(this.totalAsked),
      option(o.correctCount).getOrElseValue(this.correctCount),
      option(o.totalCount).getOrElseValue(this.totalCount),
      option<SessionQuestion | undefined>(o.current).getOrElseValue(
        this.current,
      ),
      option(o.expiresAt).getOrElseValue(this.expiresAt),
      option(o.updatedAt).getOrElseValue(this.updatedAt),
    );
  }
}

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const createSessionId = () => crypto.randomBytes(8).toString("hex");

/**
 * Идентификаторы сессий.
 */
export class SessionId {
  /**
   * Создает новый идентификатор сессии.
   */
  static next() {
    return createSessionId();
  }
}

const toSessionQuestion = (value?: SessionQuestion) => {
  if (!value) {
    return undefined;
  }
  return new SessionQuestion(
    value.verbId,
    value.options,
    value.correctIndex,
    value.messageId ?? undefined,
  );
};

const toSession = (value?: Session) => {
  if (!value) {
    return undefined;
  }
  return new Session(
    value.sessionId,
    value.userId,
    value.level,
    value.mode,
    value.remainingIds,
    value.totalAsked,
    value.correctCount,
    value.totalCount,
    toSessionQuestion(value.current),
    value.expiresAt,
    value.updatedAt,
  );
};

/**
 * Репозиторий для работы с сессиями в DynamoDB.
 */
export class SessionsRepository {
  constructor(private readonly tableName: string) {}

  /**
   * Сохраняет сессию и обновляет метку времени.
   */
  async putSession(session: Session) {
    const updated = session.copy({ updatedAt: nowSeconds() });
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: updated,
      }),
    );
    return updated;
  }

  /**
   * Загружает сессию по id.
   */
  async getSession(sessionId: string) {
    const response = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { sessionId },
      }),
    );
    return toSession(response.Item as Session | undefined);
  }

  /**
   * Загружает последнюю сессию пользователя.
   */
  async getSessionByUserId(userId: number) {
    const response = await docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "userId-index",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        Limit: 1,
      }),
    );
    return toSession((response.Items?.[0] as Session | undefined) ?? undefined);
  }

  /**
   * Удаляет сессию.
   */
  async deleteSession(sessionId: string) {
    await docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { sessionId },
      }),
    );
  }
}

export const createSession = (
  userId: number,
  level: string,
  mode: TrainingMode,
  remainingIds: number[],
): Session => {
  return new Session(
    createSessionId(),
    userId,
    level,
    mode,
    remainingIds,
    0,
    0,
    remainingIds.length,
    undefined,
    nowSeconds() + 24 * 60 * 60,
    nowSeconds(),
  );
};
