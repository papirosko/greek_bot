import { TelegramResponse } from "../../src/telegram-types";

export class NullTelegramService {
  readonly sentMessages: Array<{
    chatId: number;
    text: string;
    keyboard?: unknown;
  }> = [];
  readonly editedMessages: Array<{
    chatId: number;
    messageId: number;
    text: string;
    keyboard?: unknown;
  }> = [];

  async sendMessage(
    _chatId: number,
    _text: string,
    _keyboard?: unknown,
  ): Promise<TelegramResponse<{ message_id: number }>> {
    this.sentMessages.push({
      chatId: _chatId,
      text: _text,
      keyboard: _keyboard,
    });
    return { ok: true, result: { message_id: 1 } };
  }

  async editMessageText(
    _chatId: number,
    _messageId: number,
    _text: string,
    _keyboard?: unknown,
  ): Promise<TelegramResponse<{ message_id: number }>> {
    this.editedMessages.push({
      chatId: _chatId,
      messageId: _messageId,
      text: _text,
      keyboard: _keyboard,
    });
    return { ok: true, result: { message_id: _messageId } };
  }

  async answerCallback(_callbackQueryId: string) {
    return { ok: true } as TelegramResponse<unknown>;
  }
}
