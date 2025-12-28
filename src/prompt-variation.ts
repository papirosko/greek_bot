/**
 * Expands simple prompt variations of the form {a|b|c}.
 */
export class PromptVariation {
  /**
   * Replaces {a|b|c} groups with a random option.
   * @param template Prompt template string.
   * @returns Expanded prompt.
   */
  static apply(template: string) {
    return template.replace(/\{([^{}]+)\}/g, (_match, group) => {
      const options = String(group)
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      if (options.length === 0) {
        return "";
      }
      const pick = Math.floor(Math.random() * options.length);
      return options[pick];
    });
  }
}
