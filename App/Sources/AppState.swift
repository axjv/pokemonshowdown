import Foundation
import Observation
import PSNet
import PSProtocol

/// App-wide connection + settings state (MV pattern: views read this,
/// actions live here).
@MainActor
@Observable
public final class AppState {
    public enum Connection: Equatable {
        case disconnected, connecting, connected
    }

    public var connection: Connection = .disconnected
    /// The user we're connected as ("Guest …" until login, milestone M2).
    public var userName: String?
    /// Recent decoded frames for the M1 connection feed.
    public var recentFrames: [String] = []

    public var server: ServerConfig {
        didSet { saveSettings() }
    }

    private var client: PSClient?
    private var pumpTasks: [Task<Void, Never>] = []

    private static let settingsKey = "server-config-v1"

    public init() {
        if let data = UserDefaults.standard.data(forKey: Self.settingsKey),
           let config = try? JSONDecoder().decode(ServerConfig.self, from: data) {
            server = config
        } else {
            server = .official
        }
    }

    // MARK: - actions

    public func connect() {
        let client = self.client ?? PSClient(options: .init(server: server))
        self.client = client
        pumpTasks.forEach { $0.cancel() }
        pumpTasks = [
            Task { [weak self] in
                for await state in client.states() {
                    self?.apply(state: state)
                }
            },
            Task { [weak self] in
                for await frame in client.frames() {
                    self?.ingest(frame)
                }
            },
        ]
        client.connect()
    }

    public func disconnect() {
        pumpTasks.forEach { $0.cancel() }
        pumpTasks = []
        client?.disconnect()
        connection = .disconnected
    }

    public func reconnectWithCurrentServer() {
        Task {
            await client?.setServer(server)
        }
    }

    // MARK: - internals

    private func apply(state: PSClient.State) {
        switch state {
        case .disconnected: connection = .disconnected
        case .connecting: connection = .connecting
        case .connected: connection = .connected
        }
    }

    private func ingest(_ frame: ServerFrame) {
        guard let first = frame.lines.first else { return }
        let line = first.count > 120 ? String(first.prefix(120)) + "…" : first
        recentFrames.insert("\(frame.roomID ?? "global"): \(line)", at: 0)
        if recentFrames.count > 100 {
            recentFrames.removeLast(recentFrames.count - 100)
        }
        let parsed = PSLine(parsing: first)
        if parsed.type == "updateuser" {
            userName = parsed.parts.first
        }
    }

    private func saveSettings() {
        if let data = try? JSONEncoder().encode(server) {
            UserDefaults.standard.set(data, forKey: Self.settingsKey)
        }
    }
}
