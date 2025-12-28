# Architecture

## Overview
The project is a Telegram-based training bot for Greek vocabulary. The system is layered into:
- Transport layer (Telegram API + AWS Lambda entrypoint)
- Orchestration layer (Quiz)
- Domain/game logic (games)
- Data access (sessions repository, Google Sheets)
- Shared utilities and DTOs

## Entry Points
- `src/index.ts` — AWS Lambda handler. Parses incoming API Gateway events into `TelegramUpdateMessage`, constructs services, and delegates to `Quiz`.

## Core Flow
1. `TelegramService.parseUpdate` converts API Gateway events into a `TelegramUpdateMessage` DTO.
2. `Quiz.handleUpdate` orchestrates the flow:
   - Handles menu/command messages (e.g., `/start`).
   - Routes callback queries and user answers.
   - Delegates gameplay to a `GameFactory`, which creates a game instance and produces a `GameInput`.
3. Game implementations (`ChoiceGame`, `TextGame`) execute the full flow for a step: load data, validate session, send/update messages, update session, and emit metrics.

## Domain Models / DTOs
- `TelegramUpdateMessage` (`src/telegram-types.ts`) — DTO for incoming Telegram update, with `fromJson` parsing.
- `SessionQuestion` (`src/session-question.ts`) — immutable question state. Supports `fromJson`, `copy`, and `item` serialization.
- `Session` (`src/session.ts`) — immutable session state. Supports `fromJson`, `copy`, and `item` serialization.
- `CallbackMetadata` (`src/metadata-serde.ts`) — DTO for callback metadata.

## Services
- `TelegramService` (`src/telegram.ts`) — Telegram Bot API client and update parser.
- `MetricsService` (`src/metrics.ts`) — CloudWatch metrics client with safe wrapper.
- `GoogleSpreadsheetsService` (`src/sheets.ts`) — Reads terms from Google Sheets and caches results.
- `FactQuestionService` (`src/fact-question-service.ts`) — Generates fact questions via an AI API.
- `SessionsRepository` (`src/sessions.repository.ts`) — DynamoDB persistence for sessions; creates sessions and maps to/from DTOs.
- `MenuService` (`src/menu-service.ts`) — Constructs and sends the mode selection keyboard.

## Games
- `BaseGame` (`src/games/base-game.ts`) — Base class for game flow helpers: prompts, keyboards, and sending questions.
- `ChoiceGame` (`src/games/choice-game.ts`) — Multiple-choice gameplay (button selection).
- `TextGame` (`src/games/text-game.ts`) — Text input gameplay (writing answers).
- `GameFactory` (`src/games/game-factory.ts`) — Creates game instances and maps updates to `GameInput`.
- `FactQuizGame` (`src/games/fact-quiz-game.ts`) — AI-generated fact text with multiple-choice answers.

### Game Inputs
- `GameInput` (`src/games/game-input.ts`) — Abstract input base class.
- `ChoiceGameInput` (`src/games/choice-game-input.ts`) — Chat/message/session/answer index for callbacks.
- `TextGameInput` (`src/games/text-game-input.ts`) — Chat and free-text input.

## Utilities
- `QuestionGenerator` (`src/question-generator.ts`) — Creates `SessionQuestion` using `Collection`/`HashSet` with randomized options.
- `SessionId` (`src/session-id.ts`) — Generates session IDs.
- `TimeUtils` (`src/time-utils.ts`) — Time constants and helpers.
- `MetadataSerDe` (`src/metadata-serde.ts`) — Parses callback metadata for mode/level selection.

## Data Flow
- Google Sheets term rows are mapped to `Term` and `QuizDataBase` (`src/quiz-data.ts`).
- `SessionsRepository` stores `Session.item` in DynamoDB and recreates `Session` via `fromJson`.
- `GameFactory` uses `buildInput` to decide whether a game can handle an update.

## Testing
- Jest is used for unit tests.
- Mocks are in `tests/mock/` (null Telegram/Metrics services and in-memory sessions repository).
- Deterministic test helpers avoid randomness in question ordering.
