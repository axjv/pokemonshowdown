import { PSLine } from "ps-protocol";
import { ServerConfig, officialServer, loginBaseURL } from "./server-config";

/** Outcome of an `api/login` / `api/upkeep` round trip. */
export interface LoginResult {
  success: boolean;
  loggedIn: boolean;
  /** Send this back with `/trn NAME,0,ASSERTION`. */
  assertion?: string;
  /** Human-readable failure (`actionreason`). */
  reason?: string;
}

/** A prepared HTTP request (pure data, so the flow is unit-testable without fetch). */
export interface HttpRequestSpec {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

/**
 * The login leg of PS auth (`docs/PROTOCOL-NOTES.md`): after the server
 * sends `|challstr|`, POST the credentials, get an assertion, echo it via
 * `/trn`. Requests are pure builders and responses pure parsers, so the
 * whole flow is unit-testable without a network. Mirrors Swift `LoginServer`.
 */
export const LoginServer = {
  /** `POST https://play.pokemonshowdown.com/api/login` form-encoded. */
  loginRequest(username: string, password: string, challstr: string, config?: ServerConfig): HttpRequestSpec {
    return {
      url: `${loginBaseURL(config ?? officialServer())}/api/login`,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData([
        ["name", username],
        ["pass", password],
        ["challstr", challstr],
      ]),
    };
  },

  /** `GET /api/upkeep?challstr=` — checks the saved-cookie login path;
   * kept for parity, cookies are not used in v1. */
  upkeepRequest(challstr: string, config?: ServerConfig): HttpRequestSpec {
    return {
      url: `${loginBaseURL(config ?? officialServer())}/api/upkeep?challstr=${percentEncode(challstr)}`,
      method: "GET",
      headers: {},
    };
  },

  /** PS prefixes its JSON APIs with `]` to defang direct JSON hijacking. */
  parseLoginResponse(body: string): LoginResult | null {
    const trimmed = body.startsWith("]") ? body.slice(1) : body;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const json = parsed as Record<string, unknown>;
    const str = (key: string): string | undefined =>
      typeof json[key] === "string" ? (json[key] as string) : undefined;
    return {
      success: json.actionsuccess === true,
      loggedIn: json.loggedin === true,
      assertion: str("assertion"),
      reason: str("actionreason"),
    };
  },

  /** The `/trn` line to send (0 = default avatar). */
  trnCommand(username: string, assertion: string): string {
    return `/trn ${username},0,${assertion}`;
  },

  /** Extract the challstr from a `|challstr|…` line. It may itself contain
   * `|` (the official format is `base64modpubkey|challengeid` split across
   * chunks), so re-join every part. */
  challstr(line: PSLine): string | undefined {
    if (!line.isProtocolLine || line.type !== "challstr") return undefined;
    const joined = line.parts.join("|");
    return joined === "" ? undefined : joined;
  },
};

/** Percent-encoding matching Swift's `addingPercentEncoding(withAllowedCharacters:
 * alphanumerics + "-._~")` — stricter than `encodeURIComponent`. */
function percentEncode(value: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(value)) {
    const ch = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(ch)) out += ch;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

export function formData(pairs: [string, string][]): string {
  return pairs.map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`).join("&");
}
