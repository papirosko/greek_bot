import { Collection, HashMap } from "scats";
import { GoogleSpreadsheetsService } from "../../src/sheets";
import { QuizDataBase, Term } from "../../src/quiz-data";

export type TermRow = [string, string];

/**
 * Test double for GoogleSpreadsheetsService with predefined data.
 */
export class DummySheetsService extends GoogleSpreadsheetsService {
  /**
   * @param levels Map of level -> term rows.
   */
  constructor(private readonly levels: HashMap<string, Collection<TermRow>>) {
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
}
