import { describe, expect, it, vi } from "vitest";
import { parseLine } from "ps-protocol";
import {
  LoginServer,
  PSClient,
  officialServer,
  loginBaseURL,
  wsURL,
  type WebSocketLike,
} from "../src/index";

describe("ServerConfig", () => {
  it("matches the official defaults", () => {
    const config = officialServer();
    expect(wsURL(config)).toBe("wss://sim3.psim.us/showdown/websocket");
    expect(loginBaseURL(config)).toBe("https://play.pokemonshowdown.com");
  });

  it("builds private-server URLs", () => {
    const config = {
      ...officialServer(),
      host: "ps.myserver.net",
      port: 8000,
      secure: false,
      loginHost: "ps.myserver.net",
    };
    expect(wsURL(config)).toBe("ws://ps.myserver.net:8000/showdown/websocket");
    expect(loginBaseURL(config)).toBe("https://ps.myserver.net");
  });

  it("omits the port when it matches the scheme default", () => {
    const config = { ...officialServer(), port: 443 };
    expect(wsURL(config)).toBe("wss://sim3.psim.us/showdown/websocket");
  });
});

describe("LoginServer", () => {
  it("rejoins challstr chunks", () => {
    const line = parseLine("|challstr|4|abcdef1234567890|somechallengeid");
    expect(LoginServer.challstr(line)).toBe("4|abcdef1234567890|somechallengeid");
    expect(LoginServer.challstr(parseLine("|updateuser|x"))).toBeUndefined();
  });

  it("builds the login request", () => {
    const request = LoginServer.loginRequest("ash", "p@ss", "4|a|b");
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://play.pokemonshowdown.com/api/login");
    expect(request.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(request.body).toBe("name=ash&pass=p%40ss&challstr=4%7Ca%7Cb");
  });

  it("builds the upkeep request", () => {
    const request = LoginServer.upkeepRequest("4|x|y");
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://play.pokemonshowdown.com/api/upkeep?challstr=4%7Cx%7Cy");
  });

  it("parses ]-prefixed JSON", () => {
    const result = LoginServer.parseLoginResponse(
      '] {"actionsuccess":true,"loggedin":true,"assertion":"tok3n"}',
    );
    expect(result?.success).toBe(true);
    expect(result?.assertion).toBe("tok3n");
    expect(result?.reason).toBeUndefined();
  });

  it("parses a failure reason", () => {
    const result = LoginServer.parseLoginResponse(
      '] {"actionsuccess":false,"loggedin":false,"actionreason":"`User not found` or password incorrect"}',
    );
    expect(result?.success).toBe(false);
    expect(result?.reason).toBe("`User not found` or password incorrect");
  });

  it("returns null on garbage", () => {
    expect(LoginServer.parseLoginResponse("<html>502</html>")).toBeNull();
  });

  it("builds the /trn command", () => {
    expect(LoginServer.trnCommand("Ash", "t0k")).toBe("/trn Ash,0,t0k");
  });
});

/** Minimal fake WebSocket for offline client tests. */
class FakeSocket implements WebSocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(public url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  // Test drivers:
  fireOpen(): void { this.onopen?.(); }
  fireMessage(text: string): void { this.onmessage?.({ data: text }); }
  fireClose(): void { this.onclose?.(); }
}

function connectedPair(): { client: PSClient; socket: FakeSocket } {
  let last!: FakeSocket;
  const client = new PSClient({
    autoReconnect: false,
    keepAliveInterval: 60_000,
    socketFactory: (url) => {
      last = new FakeSocket(url);
      return last;
    },
  });
  client.connect();
  last.fireOpen();
  last.fireMessage("|updateuser| Guest 1234|0|1|{}"); // flips state to connected
  return { client, socket: last };
}

describe("PSClient", () => {
  it("opens the configured URL and tracks state", () => {
    const seen: string[] = [];
    let last!: FakeSocket;
    const client = new PSClient({
      socketFactory: (url) => {
        last = new FakeSocket(url);
        return last;
      },
    });
    client.onState((s) => seen.push(s));
    expect(seen).toEqual(["disconnected"]);

    client.connect();
    expect(last.url).toBe("wss://sim3.psim.us/showdown/websocket");
    expect(seen).toEqual(["disconnected", "connecting"]);

    last.fireOpen();
    last.fireMessage("|updateuser| Guest 1234|0|1|{}");
    expect(seen.at(-1)).toBe("connected");
    expect(client.state).toBe("connected");

    client.disconnect();
    expect(seen.at(-1)).toBe("disconnected");
    expect(last.closed).toBe(true);
  });

  it("queues sends before open and flushes them once", () => {
    let last!: FakeSocket;
    const client = new PSClient({
      socketFactory: (url) => {
        last = new FakeSocket(url);
        return last;
      },
    });
    client.send("/join lobby");
    client.send("/cmd userdetails lobby");
    client.connect();
    expect(last.sent).toEqual([]);
    last.fireOpen();
    expect(last.sent).toEqual(["|/join lobby", "|/cmd userdetails lobby"]);
  });

  it("sends room-scoped frames once connected", () => {
    const { client, socket } = connectedPair();
    client.send("/choose 1", "battle-abc");
    expect(socket.sent).toContain("battle-abc|/choose 1");
  });

  it("decodes and emits room frames", () => {
    const { client, socket } = connectedPair();
    const frames: { roomID: string | null; first?: string }[] = [];
    client.onFrame((f) => frames.push({ roomID: f.roomID, first: f.lines[0] }));
    socket.fireMessage(">battle-abc\n|init|battle\n|title|Alice vs. Bob");
    expect(frames).toEqual([{ roomID: "battle-abc", first: "|init|battle" }]);
  });

  it("reconnects with backoff after a drop, and disconnect cancels it", () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const client = new PSClient({
        keepAliveInterval: 60_000,
        socketFactory: (url) => {
          const s = new FakeSocket(url);
          sockets.push(s);
          return s;
        },
      });
      client.connect();
      sockets[0]!.fireOpen();
      sockets[0]!.fireMessage("|updateuser|x|0|1|{}");
      sockets[0]!.fireClose();
      expect(client.state).toBe("disconnected");

      // Attempt 0 backs off 2s before dialing out again.
      vi.advanceTimersByTime(2_000);
      expect(sockets.length).toBe(2);
      sockets[1]!.fireOpen();
      sockets[1]!.fireMessage("|updateuser|x|0|1|{}");
      expect(client.state).toBe("connected");

      // A user-initiated disconnect cancels any later reconnect.
      sockets[1]!.fireClose();
      client.disconnect();
      vi.advanceTimersByTime(120_000);
      expect(sockets.length).toBe(2);
      expect(client.state).toBe("disconnected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("setServer switches endpoints without double-connecting", () => {
    const seen: string[] = [];
    let last!: FakeSocket;
    const client = new PSClient({
      socketFactory: (url) => {
        last = new FakeSocket(url);
        seen.push(url);
        return last;
      },
    });
    client.connect();
    last.fireOpen();
    last.fireMessage("|updateuser|x|0|1|{}");

    client.setServer({ ...officialServer(), host: "sim1.psim.us" });
    expect(seen).toEqual([
      "wss://sim3.psim.us/showdown/websocket",
      "wss://sim1.psim.us/showdown/websocket",
    ]);
  });
});
