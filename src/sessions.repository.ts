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
import { TimeUtils } from "./time-utils";

/**
 * Репозиторий для работы с сессиями в DynamoDB.
 */
export class SessionsRepository {
  private readonly docClient: DynamoDBDocumentClient;

  constructor(private readonly tableName: string) {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  createSession(
    userId: number,
    level: string,
    mode: TrainingMode,
    remainingIds: Collection<number>,
  ): Session {
    return new Session(
      SessionId.next(),
      userId,
      level,
      mode,
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
