import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            LadderView()
                .tabItem { Label("Ladder", systemImage: "square.stack.3d.up") }
            TeamsView()
                .tabItem { Label("Teams", systemImage: "shield.lefthalf.filled") }
            ChatView()
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
            ReplaysView()
                .tabItem { Label("Replays", systemImage: "play.circle") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
