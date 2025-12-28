import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { MetricsService } from "./metrics";
import { TelegramService } from "./telegram";
import { Quiz } from "./quiz";
import { GoogleSpreadsheetsService } from "./sheets";
import { SessionsRepository } from "./sessions.repository";
import { ConfigLoader } from "./config";
import { QuestionGenerator } from "./question-generator";
import { MenuService } from "./menu-service";
import { GameFactory } from "./games/game-factory";

/**
 * Load and validate configuration from the environment.
 */
const config = ConfigLoader.loadConfig();
config.valid().match({
  left: (message) => {
    throw new Error(message);
  },
  right: () => undefined,
});

/**
 * Construct service singletons for the Lambda runtime.
 */
const telegramService = new TelegramService(config.telegramToken);
const metricsService = new MetricsService();
const sheetsService = new GoogleSpreadsheetsService(
  config.serviceAccountJson,
  config.sheetsCacheTtlMs,
);
const sessionsRepository = new SessionsRepository(config.sessionsTable);
const questionGenerator = new QuestionGenerator();
const menuService = new MenuService(telegramService);
const gameFactory = new GameFactory(
  telegramService,
  sessionsRepository,
  questionGenerator,
  menuService,
  sheetsService,
  metricsService,
  config.sheetsId,
);
const quiz = new Quiz(sessionsRepository, menuService, gameFactory);

/**
 * AWS Lambda entrypoint.
 * @param event API Gateway event payload.
 * @returns API Gateway response.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    // Parse update and route to the quiz orchestrator.
    const update = telegramService.parseUpdate(event);
    await quiz.handleUpdate(update);
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    // Report handler errors via metrics without failing the webhook.
    console.error("handler_error", error);
    await metricsService.counter("Error").inc({ Stage: "handler" });
    await metricsService.counter("ErrorTotal").inc();
    return { statusCode: 200, body: "ok" };
  }
};
