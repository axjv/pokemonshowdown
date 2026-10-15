/** Which server to talk to. Defaults match official Showdown; the settings
 * screen lets users point at private servers (host/port/path all editable). */
export interface ServerConfig {
  host: string;
  port: number;
  secure: boolean;
  /** WebSocket endpoint path (official: `/showdown/websocket`). */
  socketPath: string;
  /** Server that serves `/api/login` + `/api/upkeep` (official:
   * `play.pokemonshowdown.com`; private servers use their own host). */
  loginHost: string;
}

export const officialServer = (): ServerConfig => ({
  host: "sim3.psim.us",
  port: 443,
  secure: true,
  socketPath: "/showdown/websocket",
  loginHost: "play.pokemonshowdown.com",
});

export function wsURL(config: ServerConfig): string {
  const scheme = config.secure ? "wss" : "ws";
  const defaultPort = config.secure ? 443 : 80;
  const port = config.port === defaultPort ? "" : `:${config.port}`;
  return `${scheme}://${config.host}${port}${config.socketPath}`;
}

export function loginBaseURL(config: ServerConfig): string {
  return `https://${config.loginHost}`;
}
