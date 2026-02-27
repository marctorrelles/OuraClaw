import http from "http";
import https from "https";
import { URL } from "url";
import type readline from "readline";
import { OuraTokenResponse } from "./types";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const REDIRECT_URI = "http://localhost:9876/callback";
const SCOPES = "email personal daily heartrate workout session spo2 tag stress heart_health ring_configuration";

export function buildAuthorizeUrl(clientId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<OuraTokenResponse> {
  return postTokenRequest({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
  });
}

export function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<OuraTokenResponse> {
  return postTokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

function postTokenRequest(
  body: Record<string, string>,
): Promise<OuraTokenResponse> {
  const postData = new URLSearchParams(body).toString();
  const parsed = new URL(TOKEN_URL);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse token response: ${data}`));
            }
          } else {
            reject(new Error(`Token request failed (${res.statusCode}): ${data}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

export function captureOAuthCallback(rl: readline.Interface): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let lineHandler: ((line: string) => void) | null = null;

    const settle = (code?: string, err?: Error) => {
      if (settled) return;
      settled = true;
      server.close();
      if (lineHandler) {
        rl.removeListener("line", lineHandler);
        lineHandler = null;
      }
      if (err) reject(err);
      else resolve(code!);
    };

    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const url = new URL(req.url, "http://localhost:9876");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400);
        res.end(`Authorization error: ${error}`);
        settle(undefined, new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end("Missing authorization code");
        settle(undefined, new Error("Missing authorization code in callback"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h2>OuraClaw authorized!</h2><p>You can close this tab and return to the terminal.</p></body></html>",
      );
      console.log("\nOAuth callback received automatically.");
      settle(code);
    });

    // Start local server (works when browser runs on the same machine)
    server.listen(9876);
    server.on("error", () => {
      // Port unavailable — that's fine, manual paste still works
    });

    // Manual fallback: user pastes the redirect URL or raw code
    lineHandler = (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || settled) return;

      let code: string | null = null;
      try {
        const parsed = new URL(trimmed);
        const error = parsed.searchParams.get("error");
        if (error) {
          settle(undefined, new Error(`OAuth error: ${error}`));
          return;
        }
        code = parsed.searchParams.get("code");
      } catch {
        // Not a URL — treat as raw authorization code
        code = trimmed;
      }

      if (code) {
        settle(code);
      } else {
        process.stdout.write("No code found in that input. Paste the full redirect URL or just the code: ");
      }
    };

    rl.on("line", lineHandler);

    // Timeout after 5 minutes
    setTimeout(() => {
      settle(undefined, new Error("OAuth callback timed out after 5 minutes"));
    }, 300_000);
  });
}
