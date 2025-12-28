import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { Collection, Option, none, option } from "scats";
import { Session, SessionItem } from "./session";
import { SessionId } from "./session-id";
import { TrainingMode } from "./training";
import { WordCategory, WordCategoryService } from "./word-category";
import { TimeUtils } from "./time-utils";

/**
 * Репозиторий для работы с сессиями в DynamoDB.
 */
export class SessionsRepository {
  private readonly docClient: DynamoDBDocumentClient;

  /**
   * @param tableName DynamoDB table name.
   */
  constructor(private readonly tableName: string) {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /**
   * Creates a new session with default counters.
   * @param userId Telegram user id.
   * @param level Training level.
   * @param mode Training mode.
   * @param remainingIds Remaining term ids.
   * @param category Word category.
   * @returns New Session instance.
   */
  createSession(
    userId: number,
    level: string,
    mode: TrainingMode,
    remainingIds: Collection<number>,
    category?: WordCategory,
  ): Session {
    return new Session(
      SessionId.next(),
      userId,
      level,
      mode,
      category ?? WordCategoryService.defaultCategory(),
      remainingIds,
      0,
      0,
      remainingIds.length,
      none,
      TimeUtils.nowSeconds() + TimeUtils.day / TimeUtils.second,
      TimeUtils.nowSeconds(),
    );
  }

  /**
   * Сохраняет сессию и обновляет метку времени.
   * @param session Session to store.
   * @returns Updated session with refreshed timestamp.
   */
  async putSession(session: Session) {
    const updated = session.copy({ updatedAt: TimeUtils.nowSeconds() });
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: updated.item,
      }),
    );
    return updated;
  }

  /**
   * Загружает сессию по id.
   * @param sessionId Session id.
   * @returns Option with session if present.
   */
  async getSession(sessionId: string): Promise<Option<Session>> {
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { sessionId },
      }),
    );
    return option(response.Item as SessionItem | undefined).map((item) =>
      Session.fromJson(item),
    );
  }

  /**
   * Загружает последнюю сессию пользователя.
   * @param userId Telegram user id.
   * @returns Option with latest session if present.
   */
  async getSessionByUserId(userId: number): Promise<Option<Session>> {
    const response = await this.docClient.send(
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
    return option(
      (response.Items?.[0] as SessionItem | undefined) ?? undefined,
    ).map((item) => Session.fromJson(item));
  }

  /**
   * Удаляет сессию.
   * @param sessionId Session id.
   * @returns Promise resolved when deletion completes.
   */
  async deleteSession(sessionId: string) {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { sessionId },
      }),
    );
  }
}
