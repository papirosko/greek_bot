import crypto from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
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
  remainingIds: number[];
  totalAsked: number;
  correctCount: number;
  current?: SessionQuestion;
  expiresAt: number;
};

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const createSessionId = () => crypto.randomBytes(8).toString("hex");

export const putSession = async (session: Session) => {
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

export const createSession = (userId: number, level: string, remainingIds: number[]): Session => {
  return {
    sessionId: createSessionId(),
    userId,
    level,
    remainingIds,
    totalAsked: 0,
    correctCount: 0,
    expiresAt: nowSeconds() + 24 * 60 * 60,
  };
};
