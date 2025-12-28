import https from "https";
import { FactTopic } from "./fact-topic";
import { PromptVariation } from "./prompt-variation";

export type FactQuestion = {
  fact: string;
  question: string;
  options: string[];
  correctIndex: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

/**
 * Service that generates fact questions using an AI API.
 */
export class FactQuestionService {
  /**
   * @param apiKey AI API key.
   * @param apiBaseUrl AI API base URL (OpenAI-compatible).
   * @param model AI model name.
   * @param timeoutMs Request timeout in milliseconds.
   */
  constructor(
    private readonly apiKey: string,
    private readonly apiBaseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  /**
   * Generates a fact question based on a topic and level.
   * @param level CEFR level (A1/A2/B1/B2).
   * @param topic Topic template from sheets.
   * @param recentFacts Recent fact texts to avoid repetition.
   * @returns FactQuestion with text, question, options, and correct index.
   */
  async generate(
    level: string,
    topic: FactTopic,
    recentFacts: string[],
  ): Promise<FactQuestion> {
    this.ensureConfigured();
    const content = await this.requestCompletion(
      this.buildPayload(level, topic, recentFacts),
    );
    const parsed = this.parseQuestion(content);
    const normalized = this.normalizeQuestion(parsed);
    this.validateQuestion(normalized);
    return normalized;
  }

  /**
   * Ensures configuration is present.
   */
  private ensureConfigured() {
    if (!this.apiKey || !this.apiBaseUrl || !this.model) {
      throw new Error("Missing AI API configuration");
    }
  }

  /**
   * Builds a chat completion payload.
   * @param level CEFR level.
   * @param topic Topic template.
   * @param recentFacts Recent fact texts.
   * @returns Payload ready for the API.
   */
  private buildPayload(level: string, topic: FactTopic, recentFacts: string[]) {
    const recent = recentFacts.length
      ? `Не повторяй факты из последних 20 сообщений. Список: ${recentFacts.join(
          " | ",
        )}`
      : "Не повторяй факты из последних 20 сообщений.";
    const prompt = PromptVariation.apply(topic.prompt);

    return {
      model: this.model,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "Ты генерируешь короткий факт на греческом языке для изучающих язык. Отвечай строго JSON.",
        },
        {
          role: "user",
          content: [
            "Сгенерируй текст с фактом на греческом языке (до 80 слов).",
            "В конце добавь вопрос по тексту.",
            "Дай 4 варианта ответа на вопрос, один правильный.",
            "В вариантах ответа избегай слов, которые есть в тексте факта.",
            "Пиши только по-гречески, без русского и английского.",
            "Используй только греческий алфавит в тексте, вопросе и вариантах.",
            "Проверь согласование рода/числа/падежа и избегай смешения времен.",
            "Используй для текста лексику уровня " + level.toUpperCase() + ".",
            "Тема:",
            topic.title,
            "Инструкция к теме:",
            prompt,
            recent,
            "Формат ответа (строго JSON):",
            "{",
            '  "fact": "текст факта, без вопроса",',
            '  "question": "вопрос",',
            '  "options": ["A", "B", "C", "D"],',
            '  "correctIndex": 0',
            "}",
          ].join("\n"),
        },
      ],
    };
  }

  /**
   * Calls the AI API and returns the raw content string.
   * @param payload Chat completion payload.
   * @returns Raw content from the assistant response.
   */
  private async requestCompletion(payload: Record<string, unknown>) {
    const base = this.apiBaseUrl.replace(/\/+$/, "");
    const url = new URL(`${base}/chat/completions`);
    const body = JSON.stringify(payload);

    return new Promise<string>((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: this.timeoutMs,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              return reject(new Error(`AI error ${res.statusCode}: ${data}`));
            }
            const payload = JSON.parse(data) as ChatCompletionResponse;
            const content = payload.choices?.[0]?.message?.content;
            if (!content) {
              return reject(new Error("AI response is empty"));
            }
            resolve(content.trim());
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error("AI request timeout"));
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * Parses a JSON response into a FactQuestion.
   * @param content Raw AI content.
   * @returns Parsed FactQuestion.
   */
  private parseQuestion(content: string): FactQuestion {
    const cleaned = content
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) {
      throw new Error("AI response is not JSON");
    }
    const json = cleaned.slice(start, end + 1);
    return JSON.parse(json) as FactQuestion;
  }

  /**
   * Normalizes parsed question fields.
   * @param question Parsed question.
   * @returns Normalized question.
   */
  private normalizeQuestion(question: FactQuestion): FactQuestion {
    return {
      fact: String(question.fact ?? "").trim(),
      question: String(question.question ?? "").trim(),
      options: Array.isArray(question.options)
        ? question.options.map((item) => String(item).trim())
        : [],
      correctIndex: Number(question.correctIndex),
    };
  }

  /**
   * Validates fact question structure.
   * @param question Parsed question.
   */
  private validateQuestion(question: FactQuestion) {
    if (!question.fact || !question.question || question.options.length !== 4) {
      throw new Error("AI response has invalid structure");
    }
    if (
      !Number.isInteger(question.correctIndex) ||
      question.correctIndex < 0 ||
      question.correctIndex > 3
    ) {
      throw new Error("AI response has invalid correct index");
    }
    if (this.countWords(question.fact) > 80) {
      throw new Error("AI response exceeds 80 words");
    }
    if (question.options.some((item) => !item)) {
      throw new Error("AI response has empty options");
    }
  }

  /**
   * Counts words in a string.
   * @param value Input text.
   * @returns Word count.
   */
  private countWords(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }
}
