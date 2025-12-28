import { none, some } from "scats";
import { MetadataSerDe } from "../../src/metadata-serde";
import { TelegramUpdateMessage } from "../../src/telegram-types";
import { TrainingMode } from "../../src/training";
import { WordCategory } from "../../src/word-category";

const makeUpdate = (data?: string) =>
  TelegramUpdateMessage.fromJson({
    callback_query: {
      id: "cb1",
      data,
      message: {
        chat: { id: 101 },
        message_id: 202,
      },
    },
  });

describe("MetadataSerDe", () => {
  it("extracts callback metadata from update", () => {
    const update = makeUpdate("mode:ru-gr");
    const metadata = MetadataSerDe.fromUpdate(update);

    expect(metadata).toEqual(
      some({
        chatId: 101,
        messageId: 202,
        callbackId: "cb1",
        data: "mode:ru-gr",
      }),
    );
  });

  it("returns none when callback metadata is missing", () => {
    const update = TelegramUpdateMessage.fromJson({});

    expect(MetadataSerDe.fromUpdate(update)).toEqual(none);
  });

  it("parses mode with fallback", () => {
    expect(MetadataSerDe.parseMode("mode:ru-gr")).toBe(TrainingMode.RuGr);
    expect(MetadataSerDe.parseMode("mode:unknown")).toBe(TrainingMode.GrRu);
  });

  it("parses level and mode from metadata", () => {
    expect(
      MetadataSerDe.parseLevel("level:a2|mode:write"),
    ).toEqual(some({ level: "a2", mode: TrainingMode.Write }));
    expect(
      MetadataSerDe.parseLevel("level:a1|mode:ru-gr|category:verbs"),
    ).toEqual(
      some({ level: "a1", mode: TrainingMode.RuGr, category: WordCategory.Verbs }),
    );
    expect(MetadataSerDe.parseLevel("mode:ru-gr")).toEqual(none);
  });

  it("parses category and mode from metadata", () => {
    expect(
      MetadataSerDe.parseCategory("category:nouns|mode:gr-ru"),
    ).toEqual(some({ category: WordCategory.Nouns, mode: TrainingMode.GrRu }));
    expect(MetadataSerDe.parseCategory("category:verbs|mode:write")).toEqual(
      none,
    );
  });
});
