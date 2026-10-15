/**
 * One protocol line: either `|TYPE|PART|PART…` (a protocol line) or a raw
 * display line with no leading pipe (the server occasionally sends those).
 *
 * Message text can itself contain `|`, so use `joinedParts(line, i)` rather
 * than assuming fixed column counts.
 */
export interface PSLine {
  /** Whether the original line started with `|`. */
  isProtocolLine: boolean;
  /** Chunk after the leading `|` (`c`, `join`, `move`, …). */
  type: string;
  /** Remaining chunks, raw (not re-joined). */
  parts: string[];
}

export function parseLine(line: string): PSLine {
  const isProtocolLine = line.startsWith("|");
  let chunks = line.split("|");
  if (isProtocolLine) chunks = chunks.slice(1);
  const first = chunks[0] ?? "";
  if (isProtocolLine && first.startsWith("c:")) {
    // Timestamped chat (`|c:TS|USER|…`) carries the timestamp inside the
    // chunk; split it out so `type === "c:"` and parts[0] is the timestamp,
    // matching how the official client handles `c:` lines.
    return { isProtocolLine, type: "c:", parts: [first.slice(2), ...chunks.slice(1)] };
  }
  return {
    isProtocolLine,
    type: first,
    parts: chunks.slice(1),
  };
}

/** All parts joined back with `|` (restores message text). */
export function joinedParts(line: PSLine, from = 0): string {
  return line.parts.slice(from).join("|");
}
