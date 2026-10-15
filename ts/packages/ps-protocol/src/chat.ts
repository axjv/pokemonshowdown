/** Chat permission rank, from the first character of a PS user string. */
export type Rank = " " | "+" | "%" | "@" | "&" | "~" | "#" | "!" | "*";

const RANK_CHARS = new Set<string>([" ", "+", "%", "@", "&", "~", "#", "!", "*"]);

/** A user as they appear in chat (`@Bob`) or a `|users|` list entry. */
export interface RoomUser {
  rank: Rank;
  name: string;
  /** Userlist entries append `@!` (away) or `@status`. */
  away: boolean;
}

export function parseRoomUser(rawUser: string): RoomUser {
  let text = rawUser;
  let away = false;
  // Status suffix separator `@` is never the first char (rank position).
  const at = text.indexOf("@", 1);
  if (at >= 0) {
    away = text.slice(at) === "@!";
    text = text.slice(0, at);
  }
  const first = text.charAt(0);
  const hasRank = text.length > 0 && RANK_CHARS.has(first);
  return {
    rank: (hasRank ? first : " ") as Rank,
    name: hasRank ? text.slice(1) : text,
    away,
  };
}

/** A parsed `|c|`/`|c:|` chat message. */
export interface ChatMessage {
  sender: RoomUser;
  message: string;
  /** Unix seconds, present only for `|c:|` lines. */
  timestamp?: number;
}
