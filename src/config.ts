import { Either, left, option, right } from "scats";

/**
 * Конфигурация приложения, загружаемая из переменных окружения.
 */
export class Config {
  /**
   * @param telegramToken Telegram bot token.
   * @param sheetsId Google Sheets id.
   * @param serviceAccountJson Google service account JSON.
   * @param sessionsTable DynamoDB sessions table name.
   * @param sheetsCacheTtlMs Sheets cache TTL in ms.
   */
  constructor(
    readonly telegramToken: string,
    readonly sheetsId: string,
    readonly serviceAccountJson: string,
    readonly sessionsTable: string,
    readonly sheetsCacheTtlMs: number,
  ) {}

  /**
   * Возвращает копию конфигурации с частичными изменениями.
   * @param o Partial updates.
   * @returns New Config instance.
   */
  copy(o: Partial<Config>) {
    return new Config(
      option(o.telegramToken).getOrElseValue(this.telegramToken),
      option(o.sheetsId).getOrElseValue(this.sheetsId),
      option(o.serviceAccountJson).getOrElseValue(this.serviceAccountJson),
      option(o.sessionsTable).getOrElseValue(this.sessionsTable),
      option(o.sheetsCacheTtlMs).getOrElseValue(this.sheetsCacheTtlMs),
    );
  }

  /**
   * Валидирует обязательные параметры конфигурации.
   * @returns Either with error message or void.
   */
  valid(): Either<string, void> {
    if (!this.telegramToken) {
      return left("Missing TELEGRAM_TOKEN");
    }
    if (!this.sheetsId) {
      return left("Missing GOOGLE_SHEETS_ID");
    }
    if (!this.serviceAccountJson) {
      return left("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
    }
    if (!this.sessionsTable) {
      return left("Missing SESSIONS_TABLE");
    }
    return right(undefined as void);
  }
}

/**
 * Загрузчик конфигурации из окружения.
 */
export class ConfigLoader {
  /**
   * Считывает переменные окружения и возвращает Config.
   * @returns Config loaded from environment.
   */
  static loadConfig(): Config {
    return new Config(
      process.env.TELEGRAM_TOKEN ?? "",
      process.env.GOOGLE_SHEETS_ID ?? "",
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
      process.env.SESSIONS_TABLE ?? "sessions",
      5 * 60 * 1000,
    );
  }
}
