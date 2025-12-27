/**
 * Утилиты для base64url кодирования.
 */
export class Base64Utils {
  /**
   * Кодирует строку в base64url (без паддинга).
   */
  static toUrl(input: string) {
    return Buffer.from(input)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }
}
