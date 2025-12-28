import https from "https";
import crypto from "crypto";
import { Collection, Try } from "scats";
import { Base64Utils } from "./base64-utils";
import { QuizDataBase, Term } from "./quiz-data";
import { TextTopic, TextTopicService } from "./text-topic";
import { FactTopic, FactTopicService } from "./fact-topic";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type CachedLevel = {
  fetchedAt: number;
  data: QuizDataBase;
};

type CachedTextTopics = {
  fetchedAt: number;
  data: Collection<TextTopic>;
};

type CachedFactTopics = {
  fetchedAt: number;
  data: Collection<FactTopic>;
};

/**
 * Сервис для чтения данных из Google Spreadsheets.
 */
export class GoogleSpreadsheetsService {
  private readonly cache = new Map<string, CachedLevel>();
  private readonly textTopicsCache = new Map<string, CachedTextTopics>();
  private readonly factTopicsCache = new Map<string, CachedFactTopics>();

  /**
   * @param serviceAccountJson Google service account JSON.
   * @param cacheTtlMs Cache TTL in milliseconds.
   */
  constructor(
    private readonly serviceAccountJson: string,
    private readonly cacheTtlMs: number,
  ) {}

  /**
   * Загружает базу терминов для указанного уровня.
   * @param spreadsheetId Google Sheets id.
   * @param level Training level key.
   * @returns QuizDataBase for the level.
   */
  async loadDataBase(
    spreadsheetId: string,
    level: string,
  ): Promise<QuizDataBase> {
    // Return cached data when still fresh.
    const cached = this.cache.get(`${spreadsheetId}:${level}`);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.data;
    }
    // Fetch and cache the data from the API.
    const data = await this.fetchLevel(spreadsheetId, level);
    this.cache.set(`${spreadsheetId}:${level}`, {
      data,
      fetchedAt: Date.now(),
    });
    return data;
  }

  /**
   * Загружает список текстов и тем для уровня.
   * @param spreadsheetId Google Sheets id.
   * @param level Training level key.
   * @returns Collection of text topics.
   */
  async loadTextTopics(
    spreadsheetId: string,
    level: string,
  ): Promise<Collection<TextTopic>> {
    const cacheKey = `${spreadsheetId}:text:${level}`;
    const cached = this.textTopicsCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.data;
    }
    const data = await this.fetchTextTopics(spreadsheetId, level);
    this.textTopicsCache.set(cacheKey, {
      data,
      fetchedAt: Date.now(),
    });
    return data;
  }

  /**
   * Загружает список тем для фактов по уровню.
   * @param spreadsheetId Google Sheets id.
   * @param level Training level key.
   * @returns Collection of fact topics.
   */
  async loadFactTopics(
    spreadsheetId: string,
    level: string,
  ): Promise<Collection<FactTopic>> {
    const cacheKey = `${spreadsheetId}:fact:${level}`;
    const cached = this.factTopicsCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.data;
    }
    const data = await this.fetchFactTopics(spreadsheetId, level);
    this.factTopicsCache.set(cacheKey, {
      data,
      fetchedAt: Date.now(),
    });
    return data;
  }

  /**
   * Parses and validates the service account credentials.
   * @returns Parsed service account data.
   */
  private parseServiceAccount(): ServiceAccount {
    if (!this.serviceAccountJson) {
      throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
    }
    const parsed = Try(() =>
      JSON.parse(this.serviceAccountJson),
    ).toOption.getOrElse(() => ({}));
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON");
    }
    return parsed as ServiceAccount;
  }

  /**
   * Requests an OAuth token using a JWT assertion.
   * @param account Parsed service account data.
   * @returns Access token string.
   */
  private requestToken(account: ServiceAccount) {
    // Build JWT claims and signed assertion.
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    const jwtHeader = Base64Utils.toUrl(JSON.stringify(header));
    const jwtClaims = Base64Utils.toUrl(JSON.stringify(claims));
    const toSign = `${jwtHeader}.${jwtClaims}`;
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(toSign)
      .sign(account.private_key, "base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const jwt = `${toSign}.${signature}`;

    // Exchange JWT for an access token.
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString();

    return new Promise<string>((resolve, reject) => {
      const req = https.request(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              return reject(
                new Error(`Token error ${res.statusCode}: ${data}`),
              );
            }
            const payload = JSON.parse(data) as { access_token?: string };
            if (!payload.access_token) {
              return reject(new Error("Missing access token"));
            }
            resolve(payload.access_token);
          });
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Fetches a level range from Google Sheets.
   * @param spreadsheetId Google Sheets id.
   * @param level Training level key.
   * @returns QuizDataBase for the level.
   */
  private async fetchLevel(
    spreadsheetId: string,
    level: string,
  ): Promise<QuizDataBase> {
    // Resolve token and build the Sheets API request.
    const account = this.parseServiceAccount();
    const token = await this.requestToken(account);
    const range = `${encodeURIComponent(level)}!A2:B`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`;

    // Fetch values and map them into terms.
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              return reject(
                new Error(`Sheets error ${res.statusCode}: ${data}`),
              );
            }
            const payload = JSON.parse(data) as { values?: string[][] };
            const values = payload.values ?? [];
            const termRows = values
              .map((row) => ({
                greek: (row[0] ?? "").trim(),
                russian: (row[1] ?? "").trim(),
              }))
              .filter((row) => row.greek && row.russian)
              .map((row) => new Term(row.russian, row.greek));
            const terms = new Collection(termRows);
            resolve(QuizDataBase.forAllModes(terms));
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  /**
   * Fetches a text-topic range from Google Sheets.
   * @param spreadsheetId Google Sheets id.
   * @param level Training level key.
   * @returns Collection of text topics.
   */
  private async fetchTextTopics(
    spreadsheetId: string,
    level: string,
  ): Promise<Collection<TextTopic>> {
    const account = this.parseServiceAccount();
    const token = await this.requestToken(account);
    const sheetName = TextTopicService.sheetName(level);
    const range = `${encodeURIComponent(sheetName)}!A2:B`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`;

    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              return reject(
                new Error(`Sheets error ${res.statusCode}: ${data}`),
              );
            }
            const payload = JSON.parse(data) as { values?: string[][] };
            const values = payload.values ?? [];
            const topics = values
              .map((row) => TextTopic.fromRow(row))
              .filter((row) => row.isDefined)
              .map((row) =>
                row.getOrElseThrow(() => new Error("Missing text topic")),
              );
            resolve(new Collection(topics));
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  /**
   * Fetches a fact-topic range from Google Sheets.
   * @param spreadsheetId Google Sheets id.
   * @param level Training level key.
   * @returns Collection of fact topics.
   */
  private async fetchFactTopics(
    spreadsheetId: string,
    level: string,
  ): Promise<Collection<FactTopic>> {
    const account = this.parseServiceAccount();
    const token = await this.requestToken(account);
    const sheetName = FactTopicService.sheetName(level);
    const range = `${encodeURIComponent(sheetName)}!A2:B`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`;

    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              return reject(
                new Error(`Sheets error ${res.statusCode}: ${data}`),
              );
            }
            const payload = JSON.parse(data) as { values?: string[][] };
            const values = payload.values ?? [];
            const topics = values
              .map((row) => FactTopic.fromRow(row))
              .filter((row) => row.isDefined)
              .map((row) =>
                row.getOrElseThrow(() => new Error("Missing fact topic")),
              );
            resolve(new Collection(topics));
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }
}
