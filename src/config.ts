export const config = {
  telegramToken: process.env.TELEGRAM_TOKEN ?? "",
  sheetsId: process.env.GOOGLE_SHEETS_ID ?? "",
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  sessionsTable: process.env.SESSIONS_TABLE ?? "sessions",
  sheetsCacheTtlMs: 5 * 60 * 1000,
};
