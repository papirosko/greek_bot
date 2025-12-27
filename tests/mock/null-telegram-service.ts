import { TelegramResponse } from "../../src/telegram-types";

/**
 * Test double that records outbound Telegram calls without real network I/O.
 */
export class NullTelegramService {
  /**
   * Captured outbound sendMessage calls.
   */
  readonly sentMessages: Array<{
    chatId: number;
    text: string;
    keyboard?: unknown;
  }> = [];
  /**
   * Captured outbound editMessageText calls.
   */
  readonly editedMessages: Array<{
    chatId: number;
    messageId: number;
    text: string;
    keyboard?: unknown;
  }> = [];

  /**
   * Mocks sending a Telegram message.
   * @param _chatId Telegram chat id.
   * @param _text Message text.
   * @param _keyboard Optional inline keyboard.
   * @returns TelegramResponse stub with message id.
   */
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

  /**
   * Mocks editing a Telegram message.
   * @param _chatId Telegram chat id.
   * @param _messageId Telegram message id.
   * @param _text Updated message text.
   * @param _keyboard Optional inline keyboard.
   * @returns TelegramResponse stub.
   */
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

  /**
   * Mocks answering a callback query.
   * @param _callbackQueryId Callback query id.
   * @returns TelegramResponse stub.
   */
  async answerCallback(_callbackQueryId: string) {
    return { ok: true } as TelegramResponse<unknown>;
  }
}
