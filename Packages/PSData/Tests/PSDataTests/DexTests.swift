import XCTest
@testable import PSData
import PSProtocol

final class DexTests: XCTestCase {
    private func sampleDex() throws -> Dex {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // …/PSDataTests
            .deletingLastPathComponent() // …/Tests
            .deletingLastPathComponent() // …/PSData
            .deletingLastPathComponent() // …/Packages
            .appendingPathComponent("fixtures/dex/dex-sample.json")
        return try Dex(json: Data(contentsOf: url))
    }

    func testFixtureLoads() throws {
        let dex = try sampleDex()
        XCTAssertEqual(dex.format, "ps-client-dex/1")
        XCTAssertEqual(dex.pokemon.count, 9)
        XCTAssertEqual(dex.species("articuno")?.name, "Articuno")
        XCTAssertEqual(dex.species("Great Tusk")?.num, 984) // display name lookup
        XCTAssertEqual(dex.move("Ice Beam")?.basePower, 90)
        XCTAssertEqual(dex.move("icebeam")?.category, "Special")
        XCTAssertEqual(dex.item("leftovers")?.name, "Leftovers")
        XCTAssertEqual(dex.ability("swiftswim")?.name, "Swift Swim")
    }

    func testTypeEffectiveness() throws {
        let dex = try sampleDex()
        XCTAssertEqual(dex.effectiveness(attack: "Electric", against: ["Ground"]), 0)
        XCTAssertEqual(dex.effectiveness(attack: "Electric", against: ["Flying"]), 2)
        XCTAssertEqual(dex.effectiveness(attack: "Electric", against: ["Grass"]), 0.5)
        // Ice vs Ice/Flying: 0.5 (resisted by Ice) * 2 (weak to Flying) = 1
        XCTAssertEqual(dex.effectiveness(attack: "Ice", against: ["Ice", "Flying"]), 1)
        // Ground vs Water/Ground: 2 * 1 (Ground hitting Ground is neutral) = 2
        XCTAssertEqual(dex.effectiveness(attack: "Ground", against: ["Water", "Ground"]), 2)
        // Unknown defender defaults to neutral.
        XCTAssertEqual(dex.effectiveness(attack: "Bug", against: ["Stellar"]), 1)
    }

    func testBundledDexLoads() throws {
        let dex = try Dex.loadDefault()
        XCTAssertGreaterThanOrEqual(dex.pokemon.count, 9)
        XCTAssertNotNil(dex.species("articuno"))
    }
}
