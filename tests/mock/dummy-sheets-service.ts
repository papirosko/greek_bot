import { Collection, HashMap } from "scats";
import { GoogleSpreadsheetsService } from "../../src/sheets";
import { QuizDataBase, Term } from "../../src/quiz-data";

export type TermRow = [string, string];

export class DummySheetsService extends GoogleSpreadsheetsService {
  constructor(private readonly levels: HashMap<string, Collection<TermRow>>) {
    super("", 0);
  }

  async loadDataBase(_spreadsheetId: string, level: string) {
    const rows = this.levels.getOrElseValue(level, Collection.empty);
    const terms = rows.map((row) => new Term(row[1], row[0]));
    return QuizDataBase.forAllModes(terms);
  }
}
