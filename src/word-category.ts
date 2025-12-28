/**
 * Категории слов для тренировок.
 */
export enum WordCategory {
  Verbs = "verbs",
  Nouns = "nouns",
}

/**
 * Утилиты для работы с категориями слов.
 */
export class WordCategoryService {
  /**
   * Возвращает категорию по умолчанию.
   * @returns Default word category.
   */
  static defaultCategory(): WordCategory {
    return WordCategory.Verbs;
  }

  /**
   * Формирует имя вкладки в Google Sheets.
   * @param level Level key (a1/a2/b1/b2).
   * @param category Word category, defaults to verbs.
   * @returns Sheet tab name.
   */
  static sheetName(level: string, category?: WordCategory): string {
    const normalizedLevel = level.toLowerCase();
    const selectedCategory = category ?? WordCategory.Verbs;
    return `${selectedCategory}_${normalizedLevel}`;
  }

  /**
   * Возвращает человекочитаемую метку категории.
   * @param category Word category.
   * @returns Display label in Russian.
   */
  static formatLabel(category: WordCategory): string {
    return category === WordCategory.Nouns ? "существительные" : "глаголы";
  }
}
