import { Collection, Option, none, mutable } from "scats";
import { Session } from "../../src/session";
import { SessionId } from "../../src/session-id";
import { TimeUtils } from "../../src/time-utils";
import { TrainingMode } from "../../src/training";

export class InMemorySessionsRepository {
  private readonly sessions = new mutable.HashMap<string, Session>();
  private readonly userIndex = new mutable.HashMap<number, string>();

  createSession(
    userId: number,
    level: string,
    mode: TrainingMode,
    remainingIds: Collection<number>,
  ): Session {
    return new Session(
      SessionId.next(),
      userId,
      level,
      mode,
      remainingIds,
      0,
      0,
      remainingIds.length,
      none,
      TimeUtils.nowSeconds() + TimeUtils.day / TimeUtils.second,
      TimeUtils.nowSeconds(),
    );
  }

  async putSession(session: Session) {
    const updated = session.copy({ updatedAt: TimeUtils.nowSeconds() });
    this.sessions.set(updated.sessionId, updated);
    this.userIndex.set(updated.userId, updated.sessionId);
    return updated;
  }

  async getSession(sessionId: string): Promise<Option<Session>> {
    return this.sessions.get(sessionId);
  }

  async getSessionByUserId(userId: number): Promise<Option<Session>> {
    return this.userIndex.get(userId).flatMap((id) =>
      this.sessions.get(id),
    );
  }

  async deleteSession(sessionId: string) {
    this.sessions.get(sessionId).foreach((session) => {
      this.userIndex.remove(session.userId);
    });
    this.sessions.remove(sessionId);
  }
}
