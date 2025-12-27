import crypto from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { TrainingMode } from "./training";
import { config } from "./config";

export type SessionQuestion = {
  verbId: number;
  options: number[];
  correctIndex: number;
  messageId?: number;
};

export type Session = {
  sessionId: string;
  userId: number;
  level: string;
  mode: TrainingMode;
  remainingIds: number[];
  totalAsked: number;
  correctCount: number;
  totalCount: number;
  current?: SessionQuestion;
  expiresAt: number;
  updatedAt: number;
};

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const createSessionId = () => crypto.randomBytes(8).toString("hex");

export const putSession = async (session: Session) => {
  session.updatedAt = nowSeconds();
  await docClient.send(
    new PutCommand({
      TableName: config.sessionsTable,
      Item: session,
    })
  );
  return session;
};

export const getSession = async (sessionId: string) => {
  const response = await docClient.send(
    new GetCommand({
      TableName: config.sessionsTable,
      Key: { sessionId },
    })
  );
  return response.Item as Session | undefined;
};

export const getSessionByUserId = async (userId: number) => {
  const response = await docClient.send(
    new QueryCommand({
      TableName: config.sessionsTable,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      Limit: 1,
    })
  );
  return (response.Items?.[0] as Session | undefined) ?? undefined;
};

export const deleteSession = async (sessionId: string) => {
  await docClient.send(
    new DeleteCommand({
      TableName: config.sessionsTable,
      Key: { sessionId },
    })
  );
};

export const createSession = (
  userId: number,
  level: string,
  mode: TrainingMode,
  remainingIds: number[]
): Session => {
  return {
    sessionId: createSessionId(),
    userId,
    level,
    mode,
    remainingIds,
    totalAsked: 0,
    correctCount: 0,
    totalCount: remainingIds.length,
    expiresAt: nowSeconds() + 24 * 60 * 60,
    updatedAt: nowSeconds(),
  };
};
