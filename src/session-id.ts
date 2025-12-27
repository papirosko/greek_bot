import crypto from "crypto";

/**
 * Идентификаторы сессий.
 */
export class SessionId {
  /**
   * Создает новый идентификатор сессии.
   */
  static next() {
    return crypto.randomBytes(8).toString("hex");
  }
}
