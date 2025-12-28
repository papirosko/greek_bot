import { Collection } from "scats";
import { Action } from "./action";
import { SessionsRepository } from "./sessions.repository";
import { TelegramUpdateMessage } from "./telegram-types";
import { TrainingMode } from "./training";
import { MenuService } from "./menu-service";
import { GameFactory } from "./games/game-factory";
import { MetadataSerDe } from "./metadata-serde";
import { RouteEvent, RouteEventType } from "./route-event";

/**
 * Логика тренировки: вопросы, ответы, сессии.
 */
export class Quiz {
  /**
   * @param sessionsRepository Session persistence repository.
   * @param menuService Menu sender for top-level navigation.
   * @param gameFactory Factory for game instances and inputs.
   */
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly menuService: MenuService,
    private readonly gameFactory: GameFactory,
  ) {}

  /**
   * Обрабатывает входящее обновление Telegram.
   * @param update Incoming Telegram update DTO.
   * @returns Promise resolved when the update is handled.
   */
  async handleUpdate(update: TelegramUpdateMessage) {
    // Handle callback queries regardless of message presence.
    await this.handleCallback(update);
    return await update.message
      .flatMap((message) => message.chat.map((chat) => chat.id))
      .mapPromise(async (chatId) => {
        // Normalize message text and route commands or answers.
        await update.message
          .flatMap((message) => message.text)
          .map((text) => text.trim().toLowerCase())
          .mapPromise(async (normalized) => {
            if (
              normalized === "/start" ||
              normalized === "/menu" ||
              normalized === "/end" ||
              normalized === "завершить"
            ) {
              await this.routeEvent(RouteEvent.start(chatId));
            } else if (!normalized.startsWith("/")) {
              await this.gameFactory
                .forUpdate(update)
                .mapPromise((invocation) =>
                  this.routeEvent(RouteEvent.gameInvocation(invocation)),
                );
            } else {
              await this.routeEvent(RouteEvent.unsupportedCommand(chatId));
            }
          });
      });
  }

  /**
   * Routes callback queries to menu handlers or games.
   * @param update Incoming Telegram update DTO.
   * @returns Promise resolved after routing.
   */
  private handleCallback(update: TelegramUpdateMessage) {
    return update.callbackQuery.mapPromise(async (query) => {
      const metadataOption = MetadataSerDe.fromUpdate(update);
      if (metadataOption.isDefined) {
        const metadata = metadataOption.getOrElseThrow(
          () => new Error("Missing metadata"),
        );
        if (metadata.data.startsWith("mode:")) {
          const selectedMode = MetadataSerDe.parseMode(metadata.data);
          await this.routeEvent(
            RouteEvent.modeSelected(
              metadata.chatId,
              metadata.messageId,
              metadata.callbackId,
              selectedMode,
            ),
          );
          return;
        }

        const levelMeta = MetadataSerDe.parseLevel(metadata.data);
        if (levelMeta.isDefined) {
          const parsed = levelMeta.getOrElseThrow(
            () => new Error("Missing level metadata"),
          );
          await this.routeEvent(
            RouteEvent.levelSelected(
              metadata.chatId,
              metadata.messageId,
              metadata.callbackId,
              parsed.level,
              parsed.mode,
            ),
          );
          return;
        }
      }

      const invocation = this.gameFactory.forUpdate(update);
      if (invocation.isDefined) {
        await invocation.mapPromise((item) =>
          this.routeEvent(RouteEvent.gameInvocation(item)),
        );
        return;
      }

      await this.routeEvent(RouteEvent.callbackUnknown(query.id));
    });
  }

  /**
   * Removes the active session for a user if present.
   * @param userId Telegram user id.
   * @returns Promise resolved when deletion completes.
   */
  private async clearActiveSession(userId: number) {
    // Delete the current active session if it exists.
    const activeOption =
      await this.sessionsRepository.getSessionByUserId(userId);
    await activeOption.mapPromise((active) =>
      this.sessionsRepository.deleteSession(active.sessionId),
    );
  }

  /**
   * Routes internal events to menu or game actions.
   * @param event Internal route event.
   * @returns Promise resolved when the event is handled.
   */
  private async routeEvent(event: RouteEvent) {
    if (event.type === RouteEventType.Start) {
      const payload = event.payload as { chatId: number };
      await this.clearActiveSession(payload.chatId);
      await this.renderMenuActions(this.menuService.start(payload.chatId));
      return;
    }
    if (event.type === RouteEventType.UnsupportedCommand) {
      const payload = event.payload as { chatId: number };
      await this.renderMenuActions(
        this.menuService.unsupportedCommand(payload.chatId),
      );
      return;
    }
    if (event.type === RouteEventType.ModeSelected) {
      const payload = event.payload as {
        chatId: number;
        messageId: number;
        callbackId: string;
        mode: TrainingMode;
      };
      await this.renderMenuActions(
        this.menuService.modeSelected(
          payload.chatId,
          payload.messageId,
          payload.callbackId,
          payload.mode,
        ),
      );
      return;
    }
    if (event.type === RouteEventType.LevelSelected) {
      const payload = event.payload as {
        chatId: number;
        messageId: number;
        callbackId: string;
        level: string;
        mode: TrainingMode;
      };
      const game = this.gameFactory.forMode(payload.mode);
      const actions = await game.handleLevel(
        payload.chatId,
        payload.messageId,
        payload.callbackId,
        payload.level,
        payload.mode,
      );
      await actions.mapPromise((action) => game.renderAction(action));
      return;
    }
    if (event.type === RouteEventType.GameInvocation) {
      const payload = event.payload as {
        invocation: {
          game: {
            invoke: (input: unknown) => Promise<Collection<Action>>;
            renderAction: (action: Action) => Promise<void>;
          };
          input: unknown;
        };
      };
      const actions = await payload.invocation.game.invoke(
        payload.invocation.input,
      );
      await actions.mapPromise((action) =>
        payload.invocation.game.renderAction(action),
      );
      return;
    }
    if (event.type === RouteEventType.CallbackUnknown) {
      const payload = event.payload as { callbackId: string };
      await this.renderMenuActions(
        Collection.from([
          Action.answerCallback({ callbackId: payload.callbackId }),
        ]),
      );
    }
  }

  /**
   * Renders actions using a game renderer.
   * @param actions Renderable actions.
   * @param renderer Game renderer.
   * @returns Promise resolved when rendered.
   */
  /**
   * Renders menu actions.
   * @param actions Renderable actions.
   * @returns Promise resolved when actions are rendered.
   */
  private async renderMenuActions(actions: Collection<Action>) {
    if (actions.length === 0) {
      return;
    }
    await actions.mapPromise((action) => this.menuService.renderAction(action));
  }
}
