import { Collection, HashMap } from "scats";
import { GoogleSpreadsheetsService } from "../../src/sheets";
import { QuizDataBase, Term } from "../../src/quiz-data";
import { TextTopic, TextTopicService } from "../../src/text-topic";
import { FactTopic, FactTopicService } from "../../src/fact-topic";

export type TermRow = [string, string];
export type TextTopicRow = [string, string];
export type FactTopicRow = [string, string];

/**
 * Test double for GoogleSpreadsheetsService with predefined data.
 */
export class DummySheetsService extends GoogleSpreadsheetsService {
  /**
   * @param levels Map of level -> term rows.
   * @param textLevels Map of level -> text topic rows.
   * @param factLevels Map of level -> fact topic rows.
   */
  constructor(
    private readonly levels: HashMap<string, Collection<TermRow>>,
    private readonly textLevels: HashMap<string, Collection<TextTopicRow>>,
    private readonly factLevels: HashMap<string, Collection<FactTopicRow>>,
  ) {
    super("", 0);
  }

  /**
   * Returns a QuizDataBase built from in-memory rows.
   * @param _spreadsheetId Ignored spreadsheet id.
   * @param level Training level key.
   * @returns QuizDataBase for the level.
   */
  async loadDataBase(_spreadsheetId: string, level: string) {
    const rows = this.levels.getOrElseValue(level, Collection.empty);
    const terms = rows.map((row) => new Term(row[1], row[0]));
    return QuizDataBase.forAllModes(terms);
  }

  /**
   * Returns text topics built from in-memory rows.
   * @param _spreadsheetId Ignored spreadsheet id.
   * @param level Training level key.
   * @returns Collection of text topics.
   */
  async loadTextTopics(_spreadsheetId: string, level: string) {
    const key = TextTopicService.sheetName(level);
    const rows = this.textLevels.getOrElseValue(key, Collection.empty);
    const topics = rows.map((row) => new TextTopic(row[0], row[1]));
    return new Collection(topics.toArray);
  }

  /**
   * Returns fact topics built from in-memory rows.
   * @param _spreadsheetId Ignored spreadsheet id.
   * @param level Training level key.
   * @returns Collection of fact topics.
   */
  async loadFactTopics(_spreadsheetId: string, level: string) {
    const key = FactTopicService.sheetName(level);
    const rows = this.factLevels.getOrElseValue(key, Collection.empty);
    const topics = rows.map((row) => new FactTopic(row[0], row[1]));
    return new Collection(topics.toArray);
  }
}
