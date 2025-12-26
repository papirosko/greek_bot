import https from "https";
import crypto from "crypto";
import { Try } from "scats";
import { config } from "./config";

export type VerbRow = {
  id: number;
  present: string;
  translation: string;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type CachedLevel = {
  fetchedAt: number;
  data: VerbRow[];
};

const cache = new Map<string, CachedLevel>();

const base64url = (input: string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const parseServiceAccount = (): ServiceAccount => {
  if (!config.serviceAccountJson) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  }
  const parsed = Try(() => JSON.parse(config.serviceAccountJson))
    .toOption
    .getOrElse(() => ({}));
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON");
  }
  return parsed as ServiceAccount;
};

const requestToken = (account: ServiceAccount) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaims = base64url(JSON.stringify(claims));
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
            return reject(new Error(`Token error ${res.statusCode}: ${data}`));
          }
          const payload = JSON.parse(data) as { access_token?: string };
          if (!payload.access_token) {
            return reject(new Error("Missing access token"));
          }
          resolve(payload.access_token);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

const fetchLevel = async (level: string): Promise<VerbRow[]> => {
  if (!config.sheetsId) {
    throw new Error("Missing GOOGLE_SHEETS_ID");
  }

  const account = parseServiceAccount();
  const token = await requestToken(account);
  const range = `${encodeURIComponent(level)}!A2:B`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetsId}/values/${range}?majorDimension=ROWS`;

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
            return reject(new Error(`Sheets error ${res.statusCode}: ${data}`));
          }
          const payload = JSON.parse(data) as { values?: string[][] };
          const values = payload.values ?? [];
          const rows = values
            .map((row, index) => ({
              id: index,
              present: (row[0] ?? "").trim(),
              translation: (row[1] ?? "").trim(),
            }))
            .filter((row) => row.present && row.translation);
          resolve(rows);
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
};

export const getLevelVerbs = async (level: string) => {
  const cached = cache.get(level);
  if (cached && Date.now() - cached.fetchedAt < config.sheetsCacheTtlMs) {
    return cached.data;
  }
  const data = await fetchLevel(level);
  cache.set(level, { data, fetchedAt: Date.now() });
  return data;
};
