import https from "https";
import crypto from "crypto";
import { Collection, Try } from "scats";
import { Base64Utils } from "./base64-utils";
import { QuizDataBase, Term } from "./quiz-data";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type CachedLevel = {
  fetchedAt: number;
  data: QuizDataBase;
};

/**
 * Сервис для чтения данных из Google Spreadsheets.
 */
export class GoogleSpreadsheetsService {
  private readonly cache = new Map<string, CachedLevel>();

  constructor(
    private readonly serviceAccountJson: string,
    private readonly cacheTtlMs: number,
  ) {}

  /**
   * Загружает базу терминов для указанного уровня.
   */
  async loadDataBase(
    spreadsheetId: string,
    level: string,
  ): Promise<QuizDataBase> {
    const cached = this.cache.get(`${spreadsheetId}:${level}`);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.data;
    }
    const data = await this.fetchLevel(spreadsheetId, level);
    this.cache.set(`${spreadsheetId}:${level}`, {
      data,
      fetchedAt: Date.now(),
    });
    return data;
  }

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

  private requestToken(account: ServiceAccount) {
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

  private async fetchLevel(
    spreadsheetId: string,
    level: string,
  ): Promise<QuizDataBase> {
    const account = this.parseServiceAccount();
    const token = await this.requestToken(account);
    const range = `${encodeURIComponent(level)}!A2:B`;
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
}
