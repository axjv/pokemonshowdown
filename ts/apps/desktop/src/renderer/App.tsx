import { useEffect, useRef, useState } from "react";
import {
  ClientState,
  PSClient,
  ServerConfig,
  officialServer,
  wsURL,
} from "ps-net";
import { ServerFrame, parseLine } from "ps-protocol";
import { exportTeam, importTeam, packTeam, type PokemonSet } from "ps-teams";

type Tab = "ladder" | "teams" | "chat" | "replays" | "settings";

const SETTINGS_KEY = "server-config-v1";

function loadSettings(): ServerConfig {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...officialServer(), ...(JSON.parse(raw) as ServerConfig) };
  } catch {
    /* fall through to defaults */
  }
  return officialServer();
}

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>("ladder");
  const [config, setConfig] = useState<ServerConfig>(loadSettings);
  const [connection, setConnection] = useState<ClientState>("disconnected");
  const [frames, setFrames] = useState<ServerFrame[]>([]);
  const clientRef = useRef<PSClient | null>(null);

  useEffect(() => {
    const client = new PSClient({ server: config });
    clientRef.current = client;
    const offState = client.onState(setConnection);
    const offFrame = client.onFrame((frame) => {
      setFrames((prev) => [frame, ...prev].slice(0, 100));
    });
    client.connect();
    return () => {
      offState();
      offFrame();
      client.disconnect();
      clientRef.current = null;
    };
  }, []);

  function updateConfig(next: ServerConfig): void {
    setConfig(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    clientRef.current?.setServer(next);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "ladder", label: "Ladder" },
    { id: "teams", label: "Teams" },
    { id: "chat", label: "Chat" },
    { id: "replays", label: "Replays" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="app">
      <header className="titlebar">
        <span className="brand">Pokémon Showdown</span>
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className={`status status-${connection}`}>{connection}</span>
      </header>

      {tab === "ladder" && <LadderPanel config={config} connection={connection} frames={frames} />}
      {tab === "teams" && <TeamsPanel />}
      {tab === "chat" && <Placeholder label="Lobby chat, PMs, and the room list arrive with milestone M2." />}
      {tab === "replays" && <Placeholder label="Replay browsing and playback arrive with milestone M6." />}
      {tab === "settings" && <SettingsPanel config={config} onUpdate={updateConfig} />}
    </div>
  );
}

function LadderPanel({
  config,
  connection,
  frames,
}: {
  config: ServerConfig;
  connection: ClientState;
  frames: ServerFrame[];
}): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-header">
        <code>{wsURL(config)}</code>
        <span className="hint">M1 connection feed — decoded frames from the server.</span>
      </div>
      {frames.length === 0 ? (
        <p className="empty">No data yet {connection === "connecting" ? "(connecting…)" : ""}</p>
      ) : (
        <ul className="frames">
          {frames.map((frame, i) => (
            <li key={i}>
              <span className="room">{frame.roomID ?? "global"}</span>
              <span className="line">
                {frame.lines[0] ? summarize(frame.lines[0]) : "(header only)"}
                {frame.lines.length > 1 ? ` +${frame.lines.length - 1} lines` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function summarize(line: string): string {
  const parsed = parseLine(line);
  if (!parsed.isProtocolLine) return line;
  return parsed.parts.length > 0 ? `${parsed.type}|${parsed.parts.join("|")}` : parsed.type;
}

const TEAMS_KEY = "saved-teams-v1";

interface SavedTeam {
  label: string;
  setJSON: string;
  savedAt: number;
}

function TeamsPanel(): JSX.Element {
  const [text, setText] = useState("");
  const [teams, setTeams] = useState<SavedTeam[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(TEAMS_KEY) ?? "[]") as SavedTeam[];
    } catch {
      return [];
    }
  });
  const [error, setError] = useState("");

  function saveImport(): void {
    setError("");
    const sets = importTeam(text);
    if (sets.length === 0) {
      setError("No Pokémon found — paste the full export (Nick/species + moves).");
      return;
    }
    if (sets.length > 6) {
      setError(`Too many Pokémon (${sets.length}); max is 6.`);
      return;
    }
    const next: SavedTeam[] = [
      {
        label: `${sets[0]!.species} team`,
        setJSON: JSON.stringify(sets),
        savedAt: Date.now(),
      },
      ...teams,
    ];
    setTeams(next);
    localStorage.setItem(TEAMS_KEY, JSON.stringify(next));
    setText("");
  }

  return (
    <section className="panel">
      <div className="teams-grid">
        <div>
          <h3>Import team (export format)</h3>
          <textarea
            rows={16}
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Articuno @ Leftovers\nAbility: Pressure\n- Ice Beam\n…"}
          />
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={saveImport}>
            Import
          </button>
        </div>
        <div>
          <h3>Saved teams</h3>
          {teams.length === 0 ? (
            <p className="empty">No teams yet.</p>
          ) : (
            <ul className="teams">
              {teams.map((team, i) => {
                const sets = JSON.parse(team.setJSON) as PokemonSet[];
                return (
                  <li key={team.savedAt}>
                    <strong>{team.label}</strong>
                    <code className="packed" title="packed format">{packTeam(sets).slice(0, 80)}…</code>
                    <button
                      onClick={() => {
                        const next = teams.filter((_, j) => j !== i);
                        setTeams(next);
                        localStorage.setItem(TEAMS_KEY, JSON.stringify(next));
                      }}
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  config,
  onUpdate,
}: {
  config: ServerConfig;
  onUpdate: (next: ServerConfig) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<ServerConfig>(config);
  return (
    <section className="panel">
      <h3>Server</h3>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          onUpdate(draft);
        }}
      >
        <label>
          Sim host
          <input value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} />
        </label>
        <label>
          Port
          <input
            type="number"
            value={draft.port}
            onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 0 })}
          />
        </label>
        <label>
          Websocket path
          <input
            value={draft.socketPath}
            onChange={(e) => setDraft({ ...draft, socketPath: e.target.value })}
          />
        </label>
        <label>
          Login host
          <input
            value={draft.loginHost}
            onChange={(e) => setDraft({ ...draft, loginHost: e.target.value })}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.secure}
            onChange={(e) => setDraft({ ...draft, secure: e.target.checked })}
          />
          Use TLS (wss)
        </label>
        <div className="row">
          <button className="primary" type="submit">
            Apply &amp; Reconnect
          </button>
          <button type="button" onClick={() => setDraft(officialServer())}>
            Reset to Official Showdown
          </button>
        </div>
      </form>
      <p className="hint">
        Official: sim3.psim.us:443, path /showdown/websocket, login at play.pokemonshowdown.com.
        Private servers usually use port 8000 with TLS off.
      </p>
    </section>
  );
}

function Placeholder({ label }: { label: string }): JSX.Element {
  return (
    <section className="panel">
      <p className="empty">{label}</p>
    </section>
  );
}
