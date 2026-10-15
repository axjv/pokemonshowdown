import { describe, expect, it } from "vitest";
import { RoomEventParser, Wire, parseLine, parseRoomUser, toID } from "../src/index";
import { loadFixture } from "./helpers";

describe("Wire", () => {
  it("decodes a lobby frame without header", () => {
    const frame = Wire.decodeServerFrame("|updateuser| Guest 1234|0|1|{}");
    expect(frame.roomID).toBeNull();
    expect(frame.lines).toEqual(["|updateuser| Guest 1234|0|1|{}"]);
  });

  it("decodes a room-scoped frame", () => {
    const frame = Wire.decodeServerFrame(">battle-abc\n|init|battle\n|title|Alice vs. Bob");
    expect(frame.roomID).toBe("battle-abc");
    expect(frame.lines).toEqual(["|init|battle", "|title|Alice vs. Bob"]);
  });

  it("handles header-only frames", () => {
    const frame = Wire.decodeServerFrame(">lobby");
    expect(frame.roomID).toBe("lobby");
    expect(frame.lines).toEqual([]);
  });

  it("drops blank lines and trailing newlines", () => {
    expect(Wire.decodeServerFrame("|a\n\n|b\n").lines).toEqual(["|a", "|b"]);
  });

  it("encodes client messages", () => {
    expect(Wire.encodeClientMessage("/join lobby")).toBe("|/join lobby");
    expect(Wire.encodeClientMessage("/choose 1", "battle-abc")).toBe("battle-abc|/choose 1");
  });

  it("parses the shared connect frames fixture", () => {
    const frames = loadFixture("replays/connect.frames.txt")
      .split("\n\n")
      .map((f) => f.trim())
      .filter((f) => f !== "");
    expect(frames).toHaveLength(5);

    const decoded = frames.map(Wire.decodeServerFrame);
    expect(decoded[0]!.roomID).toBeNull();
    expect(decoded[0]!.lines[0]).toMatch(/^\|updateuser\|/);
    expect(decoded[2]!.lines[0]).toMatch(/^\|challstr\|/);
    expect(decoded[3]!.roomID).toBe("lobby");
    expect(decoded[3]!.lines).toHaveLength(3);
    expect(decoded[4]!.roomID).toBe("battle-gen9ou-1234");
  });
});

describe("PSLine + toID", () => {
  it("keeps pipes inside message text", () => {
    const line = parseLine("|c|@Bob|a|b|c");
    expect(line.isProtocolLine).toBe(true);
    expect(line.type).toBe("c");
    expect(line.parts.slice(1).join("|")).toBe("a|b|c");
  });

  it("handles raw display lines", () => {
    const line = parseLine("Some announcement");
    expect(line.isProtocolLine).toBe(false);
    expect(line.type).toBe("Some announcement");
  });

  it("implements toID", () => {
    expect(toID("Mr. Mime")).toBe("mrmime");
    expect(toID("Cinderace-Gmax")).toBe("cinderacegmax");
    expect(toID("Tapu Koko")).toBe("tapukoko");
  });
});

describe("RoomUser", () => {
  it("parses rank prefix", () => {
    const user = parseRoomUser("@Bob");
    expect(user.rank).toBe("@");
    expect(user.name).toBe("Bob");
    expect(user.away).toBe(false);
  });

  it("parses away suffix", () => {
    const user = parseRoomUser("+Carol@!");
    expect(user.rank).toBe("+");
    expect(user.name).toBe("Carol");
    expect(user.away).toBe(true);
  });

  it("parses mod + away together", () => {
    const user = parseRoomUser("@Bob@!");
    expect(user.rank).toBe("@");
    expect(user.name).toBe("Bob");
    expect(user.away).toBe(true);
  });

  it("parses bots with spaces in name", () => {
    const user = parseRoomUser("*Carnivine Bot");
    expect(user.rank).toBe("*");
    expect(user.name).toBe("Carnivine Bot");
  });
});

describe("RoomEventParser", () => {
  it("parses the users list", () => {
    const event = RoomEventParser.parse(parseLine("|users|3,+Alice,Bob,*Carnivine Bot"));
    if (event.kind !== "users") throw new Error("expected users event");
    expect(event.count).toBe(3);
    expect(event.users.map((u) => u.name)).toEqual(["Alice", "Bob", "Carnivine Bot"]);
    expect(event.users.map((u) => u.rank)).toEqual(["+", " ", "*"]);
  });

  it("parses timestamped chat", () => {
    const event = RoomEventParser.parse(parseLine("|c:1718294030|@Bob|hello world"));
    if (event.kind !== "chat") throw new Error("expected chat event");
    expect(event.message.timestamp).toBe(1718294030);
    expect(event.message.sender.name).toBe("Bob");
    expect(event.message.message).toBe("hello world");
  });

  it("falls through unknown lines", () => {
    const event = RoomEventParser.parse(parseLine("|chatmsg|something"));
    expect(event).toEqual({ kind: "other", type: "chatmsg", parts: ["something"] });
  });
});
