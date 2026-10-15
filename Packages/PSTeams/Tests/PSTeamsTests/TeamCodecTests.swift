import XCTest
@testable import PSTeams
import PSProtocol

/// Loads the shared team fixtures (fixtures/teams/) that the TypeScript
/// `ps-teams` suite asserts against too — identical expectations both sides.
private func fixture(_ name: String) throws -> String {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // …/PSTeamsTests
        .deletingLastPathComponent() // …/Tests
        .deletingLastPathComponent() // …/PSTeams
        .deletingLastPathComponent() // …/Packages
        .deletingLastPathComponent() // repo root
        .appendingPathComponent("fixtures/teams/\(name)")
    return try String(contentsOf: url, encoding: .utf8)
}

final class TeamCodecTests: XCTestCase {
    func testImportExportFixture() throws {
        let export = try fixture("articuno.export.txt")
        let sets = TeamCodec.importTeam(export)
        XCTAssertEqual(sets.count, 6)

        let articuno = sets[0]
        XCTAssertEqual(articuno.species, "Articuno")
        XCTAssertEqual(articuno.name, "")
        XCTAssertEqual(articuno.item, "Leftovers")
        XCTAssertEqual(articuno.ability, "Pressure")
        XCTAssertEqual(articuno.nature, "Modest")
        XCTAssertEqual(articuno.evs, StatsValue(hp: 252, spa: 252, spd: 4))
        XCTAssertEqual(articuno.ivs, StatsValue(hp: 31, atk: 31, def: 31, spa: 30, spd: 30, spe: 31))
        XCTAssertEqual(articuno.moves, ["Ice Beam", "Hurricane", "Substitute", "Roost"])

        let volbeat = sets[2]
        XCTAssertEqual(volbeat.gender, "M")
        XCTAssertEqual(volbeat.item, "Damp Rock")

        // Re-exporting reproduces the fixture modulo markdown trailing spaces.
        let reExported = TeamCodec.exportTeam(sets)
            .components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
        let original = export
            .components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        XCTAssertEqual(reExported.filter { !$0.isEmpty }, original)
    }

    func testJSONFixtureMatchesImport() throws {
        let json = try fixture("articuno.json")
        let sets = try XCTUnwrap(TeamCodec.importFromJSON(json))
        XCTAssertEqual(sets.count, 6)
        XCTAssertEqual(sets, TeamCodec.importTeam(try fixture("articuno.export.txt")))
    }

    func testPackMatchesFixturePacked() throws {
        let packed = try fixture("articuno.packed.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        let fromImport = TeamCodec.pack(TeamCodec.importTeam(try fixture("articuno.export.txt")))
        XCTAssertEqual(fromImport, packed)
        let fromJSON = TeamCodec.pack(try XCTUnwrap(TeamCodec.importFromJSON(try fixture("articuno.json"))))
        XCTAssertEqual(fromJSON, packed)
    }

    func testUnpackRoundTrip() throws {
        let packed = try fixture("articuno.packed.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        let sets = TeamCodec.unpack(packed)
        XCTAssertEqual(sets.count, 6)
        // Re-packing is byte-identical (IDs stay IDs; no dex involved).
        XCTAssertEqual(TeamCodec.pack(sets), packed)

        let articuno = sets[0]
        XCTAssertEqual(articuno.species, "Articuno")
        XCTAssertEqual(articuno.moves, ["icebeam", "hurricane", "substitute", "roost"])
        XCTAssertEqual(articuno.ivs, StatsValue(hp: 31, atk: 31, def: 31, spa: 30, spd: 30, spe: 31))
        XCTAssertEqual(articuno.nature, "Modest")
    }

    func testExportImportRoundTrip() throws {
        let sets = TeamCodec.importTeam(try fixture("articuno.export.txt"))
        XCTAssertEqual(TeamCodec.importTeam(TeamCodec.exportTeam(sets)), sets)
    }

    func testPackEdgeCases() {
        var set = PokemonSet()
        set.name = "Sparky"
        set.species = "Pikachu"
        set.gender = "M"
        set.shiny = true
        set.level = 50
        set.happiness = 100
        set.pokeball = "cherishball"
        set.hiddenPower = "Fire"
        set.gigantamax = true
        set.dynamaxLevel = 5
        set.teraType = "Flying"
        set.evs = StatsValue(hp: 252, spe: 252)
        var ivs = StatsValue.perfectIVs
        ivs.atk = 0
        set.ivs = ivs
        set.nature = "Timid"
        set.item = "Light Ball"
        set.ability = "Static"
        set.moves = ["Volt Tackle", "Quick Attack"]

        let packed = TeamCodec.pack([set])
        XCTAssertEqual(packed,
            "Sparky|pikachu|lightball|static|volttackle,quickattack|Timid|252,,,,,252|M|,0,,,,|S|50|100,cherishball,Fire,G,5,Flying")

        let back = TeamCodec.unpack(packed)
        var expected = set
        // unpack returns dex IDs (not display names) for species/item/ability/moves.
        expected.species = "pikachu"
        expected.item = "lightball"
        expected.ability = "static"
        expected.moves = ["volttackle", "quickattack"]
        expected.pokeball = "cherishball"
        XCTAssertEqual(back, [expected])
    }

    func testDefaultsBlankInPacked() {
        var set = PokemonSet()
        set.species = "Ditto"
        set.moves = ["Transform"]
        // Level 100 / happiness 255 / IVs 31 / EVs 0 / no gender → all blank.
        XCTAssertEqual(TeamCodec.pack([set]), "Ditto||||transform|||||||")
    }
}
