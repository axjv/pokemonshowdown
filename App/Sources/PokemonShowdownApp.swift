import SwiftUI
import SwiftData

@main
struct PokemonShowdownApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
        }
        .modelContainer(for: SavedTeam.self)
    }
}
