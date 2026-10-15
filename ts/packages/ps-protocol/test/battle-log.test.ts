import { describe, expect, it } from "vitest";
import { BattleLog, decodeRequest, parseHPStatus } from "../src/index";
import { loadFixture } from "./helpers";

describe("HPStatus", () => {
  it("parses plain HP", () => {
    const hp = parseHPStatus("144/262");
    expect(hp?.numerator).toBe(144);
    expect(hp?.denominator).toBe(262);
    expect(hp?.status).toBeUndefined();
    expect(hp?.fainted).toBe(false);
  });

  it("parses HP with status", () => {
    const hp = parseHPStatus("100/100 slp");
    expect(hp?.status).toBe("slp");
    expect(hp?.fainted).toBe(false);
  });

  it("parses fainted", () => {
    const hp = parseHPStatus("0 fnt");
    expect(hp?.numerator).toBe(0);
    expect(hp?.fainted).toBe(true);
    expect(hp?.status).toBeUndefined();
  });

  it("rejects garbage", () => {
    expect(parseHPStatus("abc")).toBeNull();
  });
});

describe("BattleLog", () => {
  // Replay the shared battle fixture and assert resulting engine state.
  // The Swift suite (PSProtocol/BattleLogTests) asserts the same
  // expectations against the same file — that's the anti-drift contract.
  function replayFixture(): BattleLog {
    const log = new BattleLog();
    for (const line of loadFixture("battles/basic-singles.battle.txt").split("\n")) {
      if (line !== "") log.apply(line);
    }
    return log;
  }

  it("tracks full game state from the fixture", () => {
    const log = replayFixture();
    expect(log.players.get("p1")?.name).toBe("Alice");
    expect(log.players.get("p2")?.rating).toBe(1400);
    expect(log.teamSizes.get("p1")).toBe(3);
    expect(log.gameType).toBe("singles");
    expect(log.gen).toBe(9);
    expect(log.tier).toBe("[Gen 9] OU");
    expect(log.rules).toEqual(["Sleep Clause Mod: Limit one foe put to sleep"]);
    expect(log.isStarted).toBe(true);
    expect(log.turn).toBe(2);

    expect(log.activeByPosition.get("p1a")?.details).toBe("Meowscarada, L50");
    expect(log.activeByPosition.get("p1a")?.hpNumerator).toBe(0);
    expect(log.activeByPosition.get("p1a")?.fainted).toBe(true);
    // Garganacl switched out (replaced at p2a by Great Tusk).
    expect(log.activeByPosition.get("p2a")?.details).toBe("Great Tusk, M");
    expect(log.activeByPosition.get("p2a")?.hpNumerator).toBe(144);
    expect(log.activeByPosition.get("p2a")?.hpDenominator).toBe(341);

    expect(log.weather).toBe("Sandstorm");
    expect(log.sideConditions[1]).toEqual(["Stealth Rock"]);
    expect(log.sideConditions[0]).toEqual([]);

    expect(log.isOver).toBe(true);
    expect(log.winner).toBe("Bob");
  });

  it("records the key log beats in order", () => {
    const kinds = replayFixture().entries.map((entry) => entry.kind);
    expect(kinds).toContain("start");
    expect(kinds.filter((k) => k === "move")).toHaveLength(4);
    expect(kinds.filter((k) => k === "switchIn")).toHaveLength(3);
    expect(kinds.at(-1)).toBe("win");
  });

  it("tracks status, volatiles, and boosts", () => {
    const log = new BattleLog();
    log.apply("|switch|p1a: Slowbro|Slowbro, M|187/187");
    log.apply("|-status|p1a: Slowbro|brn|[from]item: Flame Orb");
    log.apply("|-start|p1a: Slowbro|Substitute|[time]4");
    log.apply("|-boost|p1a: Slowbro|def|1");
    log.apply("|-unboost|p1a: Slowbro|spe|1");

    const mon = log.activeByPosition.get("p1a");
    expect(mon?.status).toBe("brn");
    expect([...(mon?.volatiles ?? [])]).toEqual(["Substitute"]);
    expect(mon?.boosts.get("def")).toBe(1);
    expect(mon?.boosts.get("spe")).toBe(-1);
  });

  it("indexes minor lines with pokemon at parts[0]", () => {
    const log = new BattleLog();
    log.apply("|switch|p1a: Skarmory|Skarmory, M|183/183");
    log.apply("|-weather|Sandstorm|[from]ability: Sand Rush");
    log.apply("|-fieldstart|Trick Room|[from]move: Trick Room");
    log.apply("|-fieldend|Trick Room");
    log.apply("|-sidestart|p1: Alice|Spikes");
    log.apply("|-heal|p1a: Skarmory|191/191|[from]item: Leftovers");
    log.apply("|");

    expect(log.weather).toBe("Sandstorm");
    expect(log.fieldConditions).toEqual([]);
    expect(log.sideConditions[0]).toEqual(["Spikes"]);
    expect(log.activeByPosition.get("p1a")?.hpNumerator).toBe(191);
    expect(log.entries.at(-1)).toEqual({ kind: "spacer" });
  });
});

describe("decodeRequest", () => {
  it("decodes an active move request", () => {
    const request = decodeRequest(
      '{"active":[{"moves":[{"move":"Ice Beam","id":"icebeam","pp":10,"maxpp":10,"target":"normal","disabled":false}]}],' +
        '"side":{"name":"p1","id":"p1","pokemon":[{"ident":"p1a: Articuno","details":"Articuno, L76","condition":"237/273","active":true,"moves":["icebeam","hurricane","substitute","roost"]}]},"rqid":7}',
    );
    expect(request?.rqid).toBe(7);
    expect(request?.active?.[0]?.moves[0]?.move).toBe("Ice Beam");
    expect(request?.side?.pokemon[0]?.details).toBe("Articuno, L76");
    expect(request?.side?.pokemon[0]?.moves).toHaveLength(4);
  });

  it("decodes a team preview request", () => {
    const request = decodeRequest(
      '{"teamPreview":true,"side":{"name":"p2","id":"p2","pokemon":[{"ident":"p2: Bob","details":"Blissey","condition":"","active":false,"moves":[]}]},"rqid":3}',
    );
    expect(request?.teamPreview).toBe(true);
    expect(request?.side?.pokemon[0]?.ident).toBe("p2: Bob");
  });

  it("decodes a forceSwitch request", () => {
    const request = decodeRequest(
      '{"forceSwitch":[false,true],"side":{"name":"p1","id":"p1","pokemon":[]},"rqid":5}',
    );
    expect(request?.forceSwitch).toEqual([false, true]);
  });

  it("returns null on invalid JSON", () => {
    expect(decodeRequest("<html>")).toBeNull();
  });
});
