import { Option, option } from "scats";

export type TextTopicItem = {
  text: string;
  topic: string;
};

/**
 * Text topic entry with a short text and its theme.
 */
export class TextTopic {
  /**
   * @param text Greek text or dialog.
   * @param topic Topic label in Russian.
   */
  constructor(
    readonly text: string,
    readonly topic: string,
  ) {}

  /**
   * Returns a plain object representation.
   * @returns Serializable item.
   */
  get item(): TextTopicItem {
    return {
      text: this.text,
      topic: this.topic,
    };
  }

  /**
   * Parses a text/topic row.
   * @param row Raw spreadsheet row.
   * @returns Option with a valid TextTopic.
   */
  static fromRow(row: string[]): Option<TextTopic> {
    const text = String(row[0] ?? "").trim();
    const topic = String(row[1] ?? "").trim();
    return option(text && topic ? new TextTopic(text, topic) : undefined);
  }
}

/**
 * Helper utilities for text-topic sheets.
 */
export class TextTopicService {
  /**
   * Builds a sheet name for a level.
   * @param level Level key (a1/a2/b1/b2).
   * @returns Sheet tab name.
   */
  static sheetName(level: string) {
    return `text_${level.toLowerCase()}`;
  }
}
