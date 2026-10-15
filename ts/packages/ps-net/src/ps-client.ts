import { ServerFrame, Wire } from "ps-protocol";
import { officialServer, ServerConfig, wsURL } from "./server-config";

export type ClientState = "disconnected" | "connecting" | "connected";

/** Minimal structural view of a browser/Node `WebSocket`. */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface PSClientOptions {
  server: ServerConfig;
  autoReconnect: boolean;
  /** Send `|/cmd ping` this often (ms); PS servers time out idle sockets. */
  keepAliveInterval: number;
  /** Injectable for tests; defaults to the ambient `WebSocket`. */
  socketFactory: (url: string) => WebSocketLike;
}

/**
 * Resilient Showdown WebSocket client: framing, keepalive pings, and
 * exponential-backoff reconnects. Mirrors the Swift `PSClient` actor;
 * the desktop renderer talks to PS directly over this.
 */
export class PSClient {
  private options: PSClientOptions;
  private stateValue: ClientState = "disconnected";
  private socket: WebSocketLike | null = null;
  private socketOpen = false;
  private keepAliveTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private outbox: string[] = [];
  private generation = 0;
  private reconnectAttempt = 0;
  private frameListeners = new Set<(frame: ServerFrame) => void>();
  private stateListeners = new Set<(state: ClientState) => void>();

  constructor(options: Partial<PSClientOptions> = {}) {
    this.options = {
      server: officialServer(),
      autoReconnect: true,
      keepAliveInterval: 25_000,
      socketFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
      ...options,
    };
  }

  get state(): ClientState {
    return this.stateValue;
  }

  currentOptions(): PSClientOptions {
    return this.options;
  }

  /** Hot-swap server; reconnects if currently connected/connecting. */
  setServer(server: ServerConfig): void {
    if (server.host === this.options.server.host &&
        server.port === this.options.server.port &&
        server.secure === this.options.server.secure &&
        server.socketPath === this.options.server.socketPath &&
        server.loginHost === this.options.server.loginHost) {
      return;
    }
    this.options = { ...this.options, server };
    this.cancelReconnect();
    this.socket?.close(1000);
    this.socket = null;
    this.generation += 1;
    if (this.stateValue !== "disconnected") this.startConnection();
  }

  connect(): void {
    this.reconnectAttempt = 0;
    this.cancelReconnect();
    this.startConnection();
  }

  disconnect(): void {
    this.reconnectAttempt = 0;
    this.cancelReconnect();
    this.stopKeepAlive();
    this.socket?.close(1000);
    this.socket = null;
    this.generation += 1;
    this.setState("disconnected");
  }

  /** Queue a room-scoped message (`/choose 1` → `battle-1|/choose 1`). */
  send(text: string, roomID?: string): void {
    const frame = Wire.encodeClientMessage(text, roomID);
    if (this.socket && this.socketOpen) this.socket.send(frame);
    else this.outbox.push(frame);
  }

  /** Subscribe to decoded server frames; returns an unsubscribe function. */
  onFrame(listener: (frame: ServerFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Subscribe to connection state; also fires with the current state. */
  onState(listener: (state: ClientState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.stateValue);
    return () => this.stateListeners.delete(listener);
  }

  // MARK: - connection lifecycle

  private startConnection(): void {
    const url = wsURL(this.options.server);
    this.stopKeepAlive();
    this.socket?.close(1000);

    this.generation += 1;
    const gen = this.generation;
    const socket = this.options.socketFactory(url);
    this.socket = socket;
    this.socketOpen = false;
    this.setState("connecting");

    socket.onopen = () => {
      if (gen !== this.generation) return;
      this.socketOpen = true;
      for (const frame of this.outbox) socket.send(frame);
      this.outbox = [];
    };
    socket.onmessage = (event) => {
      if (typeof event.data === "string") this.handleMessage(event.data, gen);
    };
    socket.onclose = () => this.handleDisconnect(gen);
    socket.onerror = () => this.handleDisconnect(gen);

    this.startKeepAlive(gen);
  }

  private startKeepAlive(gen: number): void {
    this.keepAliveTimer = setInterval(() => this.sendPing(gen), this.options.keepAliveInterval);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer !== undefined) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = undefined;
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private sendPing(gen: number): void {
    if (gen === this.generation && this.socket && this.socketOpen && this.stateValue === "connected") {
      this.socket.send("|/cmd ping");
    }
  }

  private handleMessage(text: string, gen: number): void {
    if (gen !== this.generation) return;
    if (this.stateValue !== "connected") {
      this.reconnectAttempt = 0;
      this.setState("connected");
    }
    const frame = Wire.decodeServerFrame(text);
    for (const listener of this.frameListeners) listener(frame);
  }

  private handleDisconnect(gen: number): void {
    if (gen !== this.generation || this.stateValue === "disconnected") return;
    this.stopKeepAlive();
    this.socket = null;
    this.socketOpen = false;
    this.setState("disconnected");
    if (!this.options.autoReconnect) return;
    const delay = Math.min(30_000, 2_000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.startConnection();
    }, delay);
  }

  private setState(next: ClientState): void {
    if (this.stateValue === next) return;
    this.stateValue = next;
    for (const listener of this.stateListeners) listener(next);
  }
}
