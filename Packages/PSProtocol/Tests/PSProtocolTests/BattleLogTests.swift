import XCTest
@testable import PSProtocol

final class HPStatusTests: XCTestCase {
    func testPlainHP() {
        let hp = HPStatus(parsing: "144/262")
        XCTAssertEqual(hp?.numerator, 144)
        XCTAssertEqual(hp?.denominator, 262)
        XCTAssertNil(hp?.status)
        XCTAssertFalse(hp?.fainted ?? true)
    }

    func testHPWithStatus() {
        let hp = HPStatus(parsing: "100/100 slp")
        XCTAssertEqual(hp?.status, "slp")
        XCTAssertFalse(hp?.fainted ?? true)
    }

    func testFainted() {
        let hp = HPStatus(parsing: "0 fnt")
        XCTAssertEqual(hp?.numerator, 0)
        XCTAssertTrue(hp?.fainted ?? false)
        XCTAssertNil(hp?.status)
    }
}

final class BattleLogTests: XCTestCase {
    /// Replay the shared battle fixture and assert resulting engine state.
    /// The TypeScript suite (`ps-protocol`) asserts the same expectations
    /// against the same file — that's the anti-drift contract.
    func testBasicSinglesFixture() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("fixtures/battles/basic-singles.battle.txt")
        let text = try String(contentsOf: url, encoding: .utf8)

        let log = BattleLog()
        for line in text.components(separatedBy: "\n") where !line.isEmpty {
            log.apply(line)
        }

        XCTAssertEqual(log.players["p1"]?.name, "Alice")
        XCTAssertEqual(log.players["p2"]?.rating, 1400)
        XCTAssertEqual(log.teamSizes["p1"], 3)
        XCTAssertEqual(log.gameType, "singles")
        XCTAssertEqual(log.gen, 9)
        XCTAssertEqual(log.tier, "[Gen 9] OU")
        XCTAssertEqual(log.rules, ["Sleep Clause Mod: Limit one foe put to sleep"])
        XCTAssertTrue(log.isStarted)
        XCTAssertEqual(log.turn, 2)

        XCTAssertEqual(log.activeByPosition["p1a"]?.details, "Meowscarada, L50")
        XCTAssertEqual(log.activeByPosition["p1a"]?.hpNumerator, 0)
        XCTAssertTrue(log.activeByPosition["p1a"]?.fainted == true)
        // Garganacl switched out (replaced at p2a by Great Tusk), and was healed
        // to full before that.
        XCTAssertEqual(log.activeByPosition["p2a"]?.details, "Great Tusk, M")
        XCTAssertEqual(log.activeByPosition["p2a"]?.hpNumerator, 144)
        XCTAssertEqual(log.activeByPosition["p2a"]?.hpDenominator, 341)

        XCTAssertEqual(log.weather, "Sandstorm")
        XCTAssertEqual(log.sideConditions[1], ["Stealth Rock"])
        XCTAssertEqual(log.sideConditions[0], [])

        XCTAssertTrue(log.isOver)
        XCTAssertEqual(log.winner, "Bob")

        // Log entries must include the key beats in order.
        let kinds = log.entries.map { entry -> String in
            switch entry {
            case .start: return "start"
            case .turn: return "turn"
            case .move: return "move"
            case .faint: return "faint"
            case .win: return "win"
            case .switchIn: return "switch"
            default: return "other"
            }
        }
        XCTAssertEqual(kinds.firstIndex(of: "start").map { $0 >= 0 }, true)
        XCTAssertEqual(kinds.filter { $0 == "move" }.count, 4)
        XCTAssertEqual(kinds.filter { $0 == "switch" }.count, 3)
        XCTAssertEqual(kinds.last, "win")
    }

    func testStatusAndVolatileTracking() {
        let log = BattleLog()
        log.apply("|switch|p1a: Slowbro|Slowbro, M|187/187")
        log.apply("|-status|p1a: Slowbro|brn|[from]item: Flame Orb")
        log.apply("|-start|p1a: Slowbro|Substitute|[time]4")
        log.apply("|-boost|p1a: Slowbro|def|1")
        log.apply("|-unboost|p1a: Slowbro|spe|1")

        let mon = log.activeByPosition["p1a"]
        XCTAssertEqual(mon?.status, "brn")
        XCTAssertEqual(mon?.volatiles, ["Substitute"])
        XCTAssertEqual(mon?.boosts["def"], 1)
        XCTAssertEqual(mon?.boosts["spe"], -1)
    }

    func testMinorLinePartsIndexing() {
        let log = BattleLog()
        log.apply("|switch|p1a: Skarmory|Skarmory, M|183/183")
        log.apply("|-weather|Sandstorm|[from]ability: Sand Rush")
        log.apply("|-fieldstart|Trick Room|[from]move: Trick Room")
        log.apply("|-fieldend|Trick Room")
        log.apply("|-sidestart|p1: Alice|Spikes")
        log.apply("|-heal|p1a: Skarmory|191/191|[from]item: Leftovers")
        log.apply("|")

        XCTAssertEqual(log.weather, "Sandstorm")
        XCTAssertEqual(log.fieldConditions, [])
        XCTAssertEqual(log.sideConditions[0], ["Spikes"])
        XCTAssertEqual(log.activeByPosition["p1a"]?.hpNumerator, 191)
        XCTAssertEqual(log.entries.last, .spacer)
    }
}

final class BattleRequestTests: XCTestCase {
    func testActiveRequest() {
        let json = """
        {"active":[{"moves":[{"move":"Ice Beam","id":"icebeam","pp":10,"maxpp":10,"target":"normal","disabled":false}]}],\
        "side":{"name":"p1","id":"p1","pokemon":[{"ident":"p1a: Articuno","details":"Articuno, L76","condition":"237/273","active":true,"moves":["icebeam","hurricane","substitute","roost"]}]},\
        "rqid":7}
        """
        let request = BattleRequest.decode(fromJSON: json)
        XCTAssertEqual(request?.rqid, 7)
        XCTAssertEqual(request?.active?.first?.moves.first?.move, "Ice Beam")
        XCTAssertEqual(request?.side?.pokemon.first?.details, "Articuno, L76")
        XCTAssertEqual(request?.side?.pokemon.first?.moves.count, 4)
    }

    func testTeamPreviewRequest() {
        let request = BattleRequest.decode(fromJSON:
            """
            {"teamPreview":true,"side":{"name":"p2","id":"p2","pokemon":[{"ident":"p2: Bob","details":"Blissey","condition":"","active":false,"moves":[]}]},"rqid":3}
            """)
        XCTAssertEqual(request?.teamPreview, true)
        XCTAssertEqual(request?.side?.pokemon.first?.ident, "p2: Bob")
    }

    func testForceSwitchRequest() {
        let request = BattleRequest.decode(fromJSON:
            """
            {"forceSwitch":[false,true],"side":{"name":"p1","id":"p1","pokemon":[]},"rqid":5}
            """)
        XCTAssertEqual(request?.forceSwitch, [false, true])
    }
}
