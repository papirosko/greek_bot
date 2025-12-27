import { Option, option } from "scats";
import { TelegramUpdateMessage } from "./telegram-types";
import { TrainingMode } from "./training";

export class CallbackMetadata {
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

  static parseMode(data: string): TrainingMode {
    const mode = data.split(":")[1] as TrainingMode;
    return Object.values(TrainingMode).includes(mode)
      ? mode
      : TrainingMode.GrRu;
  }

  static parseLevel(data: string): Option<LevelMetadata> {
    return option(
      data.match(/^level:([a-z0-9]+)\|mode:(ru-gr|gr-ru|write)$/),
    ).map((match) => ({
      level: match[1],
      mode: match[2] as TrainingMode,
    }));
  }
}
