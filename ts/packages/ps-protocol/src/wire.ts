/**
 * A decoded frame received from the server: which room it targets, and the
 * payload lines (which still need `parseLine`).
 */
export interface ServerFrame {
  /** Room this frame targets; null means global/lobby (no `>` header). */
  roomID: string | null;
  /** Payload lines; blank lines already removed. */
  lines: string[];
}

/**
 * WebSocket text-frame codec. Verified against the live server and the
 * official client's `receive()` handling — see docs/PROTOCOL-NOTES.md.
 */
export const Wire = {
  /**
   * Decode one raw WebSocket text frame from the server. Room-scoped frames
   * start with a `>ROOMID` header line; a MESSAGE can never start with `>`.
   */
  decodeServerFrame(raw: string): ServerFrame {
    let text = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
    let roomID: string | null = null;
    if (text.startsWith(">")) {
      const nl = text.indexOf("\n");
      if (nl >= 0) {
        const room = text.slice(1, nl);
        if (room !== "") roomID = room;
        text = text.slice(nl + 1);
      } else {
        // Header with no payload: the target room is still named.
        if (text.length > 1) roomID = text.slice(1);
        text = "";
      }
    }
    const lines = text.split("\n").filter((line) => line !== "");
    return { roomID, lines };
  },

  /** Encode a client message as `ROOMID|TEXT` (`|TEXT` when room is empty). */
  encodeClientMessage(text: string, roomID?: string | null): string {
    return `${roomID ?? ""}|${text}`;
  },
};
