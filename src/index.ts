import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { safePutMetric } from "./metrics";
import { TelegramService } from "./telegram";
import { Quiz } from "./quiz";
import { GoogleSpreadsheetsService } from "./sheets";
import { SessionsRepository } from "./sessions";
import { ConfigLoader } from "./config";

const config = ConfigLoader.loadConfig();
config.valid().match({
  left: (message) => {
    throw new Error(message);
  },
  right: () => undefined,
});

const telegramService = new TelegramService(config.telegramToken);
const sheetsService = new GoogleSpreadsheetsService(
  config.serviceAccountJson,
  config.sheetsCacheTtlMs,
);
const sessionsRepository = new SessionsRepository(config.sessionsTable);
const quiz = new Quiz(
  telegramService,
  sheetsService,
  sessionsRepository,
  config.sheetsId,
);

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const update = telegramService.parseUpdate(event);
    await quiz.handleUpdate(update);
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("handler_error", error);
    await safePutMetric("Error", 1, { Stage: "handler" });
    await safePutMetric("ErrorTotal", 1, {});
    return { statusCode: 200, body: "ok" };
  }
};
