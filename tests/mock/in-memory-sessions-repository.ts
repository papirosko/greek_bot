import { Collection, Option, none, mutable } from "scats";
import { Session } from "../../src/session";
import { SessionId } from "../../src/session-id";
import { TimeUtils } from "../../src/time-utils";
import { TrainingMode } from "../../src/training";
import { WordCategory, WordCategoryService } from "../../src/word-category";

/**
 * In-memory sessions repository for tests.
 */
export class InMemorySessionsRepository {
  private readonly sessions = new mutable.HashMap<string, Session>();
  private readonly userIndex = new mutable.HashMap<number, string>();

  /**
   * Creates a new session with default counters.
   * @param userId Telegram user id.
   * @param level Training level.
   * @param mode Training mode.
   * @param remainingIds Remaining term ids.
   * @param category Word category.
   * @returns New Session instance.
   */
  createSession(
    userId: number,
    level: string,
    mode: TrainingMode,
    remainingIds: Collection<number>,
    category?: WordCategory,
  ): Session {
    return new Session(
      SessionId.next(),
      userId,
      level,
      mode,
      category ?? WordCategoryService.defaultCategory(),
      remainingIds,
      new Collection<string>([]),
      0,
      0,
      remainingIds.length,
      none,
      TimeUtils.nowSeconds() + TimeUtils.day / TimeUtils.second,
      TimeUtils.nowSeconds(),
    );
  }

  /**
   * Stores a session and updates its timestamp.
   * @param session Session to store.
   * @returns Updated session.
   */
  async putSession(session: Session) {
    const updated = session.copy({ updatedAt: TimeUtils.nowSeconds() });
    this.sessions.set(updated.sessionId, updated);
    this.userIndex.set(updated.userId, updated.sessionId);
    return updated;
  }

  /**
   * Fetches a session by id.
   * @param sessionId Session id.
   * @returns Option with session if present.
   */
  async getSession(sessionId: string): Promise<Option<Session>> {
    return this.sessions.get(sessionId);
  }

  /**
   * Fetches the most recent session for a user.
   * @param userId Telegram user id.
   * @returns Option with session if present.
   */
  async getSessionByUserId(userId: number): Promise<Option<Session>> {
    return this.userIndex.get(userId).flatMap((id) =>
      this.sessions.get(id),
    );
  }

  /**
   * Removes a session by id.
   * @param sessionId Session id.
   * @returns Promise resolved when deletion completes.
   */
  async deleteSession(sessionId: string) {
    this.sessions.get(sessionId).foreach((session) => {
      this.userIndex.remove(session.userId);
    });
    this.sessions.remove(sessionId);
  }
}
