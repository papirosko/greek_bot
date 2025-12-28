import { Option, option } from "scats";

export type FactTopicItem = {
  title: string;
  prompt: string;
};

/**
 * Fact topic entry with a human-readable title and a prompt template.
 */
export class FactTopic {
  /**
   * @param title Short topic label.
   * @param prompt Prompt template with optional variations.
   */
  constructor(
    readonly title: string,
    readonly prompt: string,
  ) {}

  /**
   * Returns a plain object representation.
   * @returns Serializable item.
   */
  get item(): FactTopicItem {
    return {
      title: this.title,
      prompt: this.prompt,
    };
  }

  /**
   * Parses a topic row.
   * @param row Raw spreadsheet row.
   * @returns Option with a valid FactTopic.
   */
  static fromRow(row: string[]): Option<FactTopic> {
    const title = String(row[0] ?? "").trim();
    const prompt = String(row[1] ?? "").trim();
    return option(title && prompt ? new FactTopic(title, prompt) : undefined);
  }
}

/**
 * Helper utilities for fact-topic sheets.
 */
export class FactTopicService {
  /**
   * Builds a sheet name for a level.
   * @param level Level key (a1/a2/b1/b2).
   * @returns Sheet tab name.
   */
  static sheetName(level: string) {
    return `fact_${level.toLowerCase()}`;
  }
}
