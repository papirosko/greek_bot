import { Option, option } from "scats";
import { TelegramUpdateMessage } from "./telegram-types";
import { TrainingMode } from "./training";

/**
 * DTO with callback metadata extracted from a Telegram update.
 */
export class CallbackMetadata {
  /**
   * @param chatId Telegram chat id.
   * @param messageId Telegram message id.
   * @param callbackId Callback query id.
   * @param data Raw callback data string.
   */
  constructor(
    readonly chatId: number,
    readonly messageId: number,
    readonly callbackId: string,
    readonly data: string,
  ) {}
}

type LevelMetadata = {
  level: string;
  mode: TrainingMode;
};

export class MetadataSerDe {
  /**
   * Extracts callback metadata from a Telegram update.
   * @param update Incoming Telegram update DTO.
   * @returns Option with callback metadata.
   */
  static fromUpdate(update: TelegramUpdateMessage): Option<CallbackMetadata> {
    return update.callbackQuery.flatMap((query) =>
      query.message.flatMap((message) =>
        message.chat.flatMap((chat) =>
          message.messageId.map(
            (messageId) =>
              new CallbackMetadata(
                chat.id,
                messageId,
                query.id,
                query.data.getOrElseValue(""),
              ),
          ),
        ),
      ),
    );
  }

  /**
   * Parses training mode from callback data.
   * @param data Raw callback data.
   * @returns Parsed training mode with fallback.
   */
  static parseMode(data: string): TrainingMode {
    const mode = data.split(":")[1] as TrainingMode;
    return Object.values(TrainingMode).includes(mode)
      ? mode
      : TrainingMode.GrRu;
  }

  /**
   * Parses level and mode selection from callback data.
   * @param data Raw callback data.
   * @returns Option with parsed level metadata.
   */
  static parseLevel(data: string): Option<LevelMetadata> {
    return option(
      data.match(/^level:([a-z0-9]+)\|mode:(ru-gr|gr-ru|write)$/),
    ).map((match) => ({
      level: match[1],
      mode: match[2] as TrainingMode,
    }));
  }
}
