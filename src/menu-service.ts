import { TelegramKeyboard, TelegramService } from "./telegram";
import { TrainingMode } from "./training";

export class MenuService {
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

  constructor(private readonly telegramService: TelegramService) {}

  sendStart(chatId: number) {
    return this.telegramService.sendMessage(
      chatId,
      "Выберите режим тренировки:",
      this.modeKeyboard,
    );
  }
}
