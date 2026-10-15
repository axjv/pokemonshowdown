import { ChatMessage, parseRoomUser } from "./chat.js";
import { joinedParts, PSLine } from "./line.js";

/** A chat-room protocol line decoded into something UI-consumable. */
export type RoomEvent =
  | { kind: "initRoom"; type: string }
  | { kind: "title"; text: string }
  /** `|users|COUNT,USER,USER,…` — the whole list arrives in one chunk. */
  | { kind: "users"; count: number; users: ReturnType<typeof parseRoomUser>[] }
  | { kind: "join"; user: ReturnType<typeof parseRoomUser> }
  | { kind: "leave"; user: ReturnType<typeof parseRoomUser> }
  /** `|name|NEW_USER|OLD_ID` */
  | { kind: "rename"; newUser: ReturnType<typeof parseRoomUser>; oldUserID: string }
  | { kind: "chat"; message: ChatMessage }
  /** Server-sent plain text with no leading pipe. */
  | { kind: "rawMessage"; text: string }
  /** `|pm|SENDER|TARGET|MESSAGE`. */
  | { kind: "pm"; sender: ReturnType<typeof parseRoomUser>; target: ReturnType<typeof parseRoomUser>; message: string }
  /** Anything else the app layer may want to handle itself. */
  | { kind: "other"; type: string; parts: string[] };

export const RoomEventParser = {
  parse(line: PSLine): RoomEvent {
    if (!line.isProtocolLine) {
      return { kind: "rawMessage", text: line.type };
    }
    switch (line.type) {
      case "init":
        return { kind: "initRoom", type: line.parts[0] ?? "chat" };
      case "title":
        return { kind: "title", text: joinedParts(line) };
      case "users": {
        const list = line.parts[0] ?? "";
        const chunks = list.split(",");
        const count = parseInt(chunks.shift() ?? "", 10) || 0;
        return { kind: "users", count, users: chunks.map(parseRoomUser) };
      }
      case "join":
      case "j":
      case "J":
        return { kind: "join", user: parseRoomUser(line.parts[0] ?? " ") };
      case "leave":
      case "l":
      case "L":
        return { kind: "leave", user: parseRoomUser(line.parts[0] ?? " ") };
      case "name":
      case "n":
      case "N":
        return {
          kind: "rename",
          newUser: parseRoomUser(line.parts[0] ?? " "),
          oldUserID: line.parts[1] ?? "",
        };
      case "c": {
        const userChunk = line.parts[0];
        if (userChunk === undefined) break;
        return {
          kind: "chat",
          message: { sender: parseRoomUser(userChunk), message: joinedParts(line, 1) },
        };
      }
      case "c:": {
        if (line.parts.length < 2) break;
        return {
          kind: "chat",
          message: {
            sender: parseRoomUser(line.parts[1] ?? " "),
            message: joinedParts(line, 2),
            timestamp: parseInt(line.parts[0] ?? "", 10) || undefined,
          },
        };
      }
      case "pm": {
        if (line.parts.length < 2) break;
        return {
          kind: "pm",
          sender: parseRoomUser(line.parts[0] ?? " "),
          target: parseRoomUser(line.parts[1] ?? " "),
          message: joinedParts(line, 2),
        };
      }
      default:
        break;
    }
    return { kind: "other", type: line.type, parts: line.parts };
  },
};
