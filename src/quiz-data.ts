import { Collection, HashMap, option } from "scats";
import { TrainingMode } from "./training";

/**
 * Неизменяемая пара: греческое слово и его перевод на русский.
 */
export class Term {
  constructor(
    readonly russian: string,
    readonly greek: string,
  ) {}

  copy(o: Partial<Term>) {
    return new Term(
      option(o.russian).getOrElseValue(this.russian),
      option(o.greek).getOrElseValue(this.greek),
    );
  }
}

/**
 * Неизменяемая база терминов, сгруппированная по режимам тренировки.
 */
export class QuizDataBase {
  constructor(readonly quizzesData: HashMap<TrainingMode, Collection<Term>>) {}

  /**
   * Возвращает копию базы с частичными изменениями.
   */
  copy(o: Partial<QuizDataBase>) {
    return new QuizDataBase(
      option(o.quizzesData).getOrElseValue(this.quizzesData),
    );
  }

  get(mode: TrainingMode) {
    return this.quizzesData.getOrElseValue(mode, Collection.empty);
  }

  static forAllModes(terms: Collection<Term>) {
    return new QuizDataBase(
      HashMap.of(
        [TrainingMode.GrRu, terms],
        [TrainingMode.RuGr, terms],
        [TrainingMode.Write, terms],
      ),
    );
  }
}
