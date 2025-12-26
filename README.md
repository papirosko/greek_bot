# Greek Bot

Telegram bot for training Greek verbs. The MVP focuses on Greek -> Russian translation using inline buttons, with all content stored in Google Sheets.

## Features
- Mode selection (currently: Translation GR -> RU).
- Level selection (A1, A2, B1, B2).
- Multiple-choice quiz with 4 options.
- Stateless Telegram callback with server-side session stored in DynamoDB.
- Results summary at the end of the session.

## Data Source (Google Sheets)
The bot reads verbs from a Google Sheet:
- Spreadsheet ID: set via `GOOGLE_SHEETS_ID`.
- Sheets: `A1`, `A2`, `B1`, `B2`.
- Columns:
  - `present_1sg_el` (Greek, 1st person singular, with accent)
  - `translation_ru` (Russian, 1st person singular)

## Infrastructure
- **API Gateway (HTTP API)** exposes `POST /webhook`.
- **AWS Lambda** handles Telegram updates and sends responses.
- **DynamoDB** stores sessions (`sessions` table) to keep state between answers.
- **Google Sheets API** provides the verb list (service account, read-only).

### DynamoDB Table
- Table: `sessions`
- Partition key: `sessionId` (String)
- TTL attribute: `expiresAt`

## Configuration
Lambda environment variables:
- `TELEGRAM_TOKEN` - bot token from BotFather
- `GOOGLE_SHEETS_ID` - Google Sheet ID
- `GOOGLE_SERVICE_ACCOUNT_JSON` - full JSON string of the service account
- `SESSIONS_TABLE` - DynamoDB table name (`sessions`)

IAM permissions for Lambda role:
- `dynamodb:GetItem`
- `dynamodb:PutItem`

## Local Development
```bash
npm install
npm run build
```

## Deployment
Deployment is automated via GitHub Actions on push to `main`.

Workflow:
- Install dependencies
- Build TypeScript
- Package `dist` + `node_modules`
- Update Lambda code

GitHub repository secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (`eu-central-1`)

## Telegram Webhook
Set webhook to API Gateway URL:
```
https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<API_URL>/webhook
```

## Project Structure
- `src/index.ts` - Lambda handler
- `src/telegram.ts` - Telegram API client
- `src/sheets.ts` - Google Sheets API access
- `src/sessions.ts` - DynamoDB session store
- `src/quiz.ts` - question generation
- `src/config.ts` - env config
