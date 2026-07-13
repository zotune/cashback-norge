#!/usr/bin/env node
// One-time Daisycon OAuth authorization ("oAuth over CLI").
//
// Daisycon has no static API keys; the API uses OAuth with PKCE. This script
// performs the single interactive step: it prints a login URL, you sign in to
// Daisycon in the browser, and Daisycon shows an authorization code on the
// https://login.daisycon.com/oauth/cli redirect page. Paste that code here and
// the script exchanges it for tokens and writes DAISYCON_REFRESH_TOKEN to .env.
//
// After this, the crawler (src/backend/providers/daisycon.ts) runs headlessly:
// it refreshes the access token on every run. Daisycon issues a rotated
// refresh token each time but keeps the old one valid, so the
// DAISYCON_REFRESH_TOKEN GitHub secret can stay static.
//
// Usage: node scripts/dev/daisycon-auth.mjs
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

const LOGIN_URL = "https://login.daisycon.com";
const REDIRECT_URI = `${LOGIN_URL}/oauth/cli`;

const clientId = await readEnvValue("DAISYCON_CLIENT_ID");
const clientSecret = await readEnvValue("DAISYCON_CLIENT_SECRET") ?? "";
if (!clientId) {
  console.error("DAISYCON_CLIENT_ID is missing (set it in .env or the environment)");
  process.exit(1);
}

const codeVerifier = randomBytes(48).toString("base64url");
const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

const authorizeUrl = new URL(`${LOGIN_URL}/oauth/authorize`);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("client_id", clientId);
authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authorizeUrl.searchParams.set("code_challenge", codeChallenge);
authorizeUrl.searchParams.set("code_challenge_method", "S256");

console.log("Open this URL in your browser and log in to Daisycon:\n");
console.log(authorizeUrl.toString());
console.log("\nAfter logging in, Daisycon shows an authorization code on the page.");

const readline = createInterface({ input: process.stdin, output: process.stdout });
const code = (await readline.question("\nPaste the authorization code: ")).trim();
readline.close();
if (!code) {
  console.error("No code entered");
  process.exit(1);
}

const response = await fetch(`${LOGIN_URL}/oauth/access-token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  }),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Token exchange failed with HTTP ${response.status}:\n${body}`);
  process.exit(1);
}

const tokens = JSON.parse(body);
if (!tokens.refresh_token) {
  console.error(`Token exchange returned no refresh token:\n${body}`);
  process.exit(1);
}

await upsertEnvValue("DAISYCON_REFRESH_TOKEN", tokens.refresh_token);
console.log("\nDAISYCON_REFRESH_TOKEN written to .env");
console.log("\nFor the daily crawl, sync the GitHub secret:");
console.log("  grep '^DAISYCON_REFRESH_TOKEN=' .env | cut -d= -f2- | tr -d '\\n' | gh secret set DAISYCON_REFRESH_TOKEN");

async function readEnvValue(key) {
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) return stripQuotes(fromEnv);

  try {
    const envFile = await readFile(".env", "utf8");
    const line = envFile
      .split(/\r?\n/)
      .find((candidate) => candidate.trimStart().startsWith(`${key}=`));
    const value = line?.split("=").slice(1).join("=").trim();
    if (value) return stripQuotes(value);
  } catch {
    return undefined;
  }

  return undefined;
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

async function upsertEnvValue(key, value) {
  let envFile = "";
  try {
    envFile = await readFile(".env", "utf8");
  } catch {
    // .env does not exist yet; create it below
  }

  const lines = envFile === "" ? [] : envFile.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trimStart().startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else {
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    lines.push(`${key}=${value}`, "");
  }

  await writeFile(".env", lines.join("\n"), "utf8");
}
