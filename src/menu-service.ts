import { TelegramKeyboard, TelegramService } from "./telegram";
import { TrainingMode } from "./training";

/**
 * Service for rendering and sending the main menu keyboard.
 */
export class MenuService {
  /**
   * Cached mode selection keyboard.
   */
  private readonly modeKeyboard = TelegramKeyboard.inline([
    [{ text: "Перевод (GR → RU)", callback_data: `mode:${TrainingMode.GrRu}` }],
    [{ text: "Перевод (RU → GR)", callback_data: `mode:${TrainingMode.RuGr}` }],
    [
      {
        text: "Написание (RU → GR)",
        callback_data: `mode:${TrainingMode.Write}`,
      },
    ],
  ]);

  /**
   * @param telegramService Telegram API client.
   */
  constructor(private readonly telegramService: TelegramService) {}

  /**
   * Sends the mode selection menu to the user.
   * @param chatId Telegram chat id.
   * @returns Promise resolved after the message is sent.
   */
  sendStart(chatId: number) {
    return this.telegramService.sendMessage(
      chatId,
      "Выберите режим тренировки:",
      this.modeKeyboard,
    );
  }
}
