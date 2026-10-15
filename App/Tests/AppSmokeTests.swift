import XCTest
import SwiftData
@testable import PokemonShowdown
import PSNet
import PSTeams

final class AppSmokeTests: XCTestCase {
    func testSavedTeamRoundTrip() throws {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: SavedTeam.self,
                                           configurations: config)
        let context = ModelContext(container)

        var set = PokemonSet()
        set.species = "Articuno"
        set.moves = ["Ice Beam"]
        let json = try XCTUnwrap(TeamCodec.exportToJSON([set]))

        let team = SavedTeam(label: "Rain", format: "gen9ou", setJSON: json)
        context.insert(team)
        try context.save()

        let fetched = try context.fetch(FetchDescriptor<SavedTeam>())
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].label, "Rain")
        XCTAssertEqual(TeamCodec.importFromJSON(fetched[0].setJSON), [set])
    }

    @MainActor
    func testAppStateDefaultsToOfficialServer() {
        let state = AppState()
        XCTAssertEqual(state.server, PSNet.ServerConfig.official)
        XCTAssertEqual(state.connection, .disconnected)
    }
}
