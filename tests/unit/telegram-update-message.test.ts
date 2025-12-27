import { none, some } from "scats";
import {
  TelegramCallbackQuery,
  TelegramCallbackQueryMessage,
  TelegramChat,
  TelegramMessage,
  TelegramUpdateMessage,
} from "../../src/telegram-types";

describe("TelegramUpdateMessage.fromJson", () => {
  it("parses message fields and converts types", () => {
    const update = TelegramUpdateMessage.fromJson({
      message: {
        chat: { id: "42" },
        text: 123,
        message_id: "7",
      },
    });

    expect(update.message).toEqual(
      some(
        new TelegramMessage(
          some(new TelegramChat(42)),
          some("123"),
          some(7),
        ),
      ),
    );
    expect(update.callbackQuery).toEqual(none);
  });

  it("parses callback query with nested message", () => {
    const update = TelegramUpdateMessage.fromJson({
      callback_query: {
        id: 999,
        data: 1,
        message: {
          chat: { id: 5 },
          message_id: "10",
        },
      },
    });

    expect(update.callbackQuery).toEqual(
      some(
        new TelegramCallbackQuery(
          "999",
          some("1"),
          some(
            new TelegramCallbackQueryMessage(
              some(new TelegramChat(5)),
              some(10),
            ),
          ),
        ),
      ),
    );
    expect(update.message).toEqual(none);
  });

  it("returns empty options for non-object payloads", () => {
    const payloads: unknown[] = [null, "nope", 123];

    for (const payload of payloads) {
      const update = TelegramUpdateMessage.fromJson(payload);
      expect(update.message).toEqual(none);
      expect(update.callbackQuery).toEqual(none);
    }
  });
});
