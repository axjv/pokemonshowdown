import Foundation

/// Which server to talk to. Defaults match official Showdown; the Settings
/// screen lets users point at private servers (host/port/path all editable).
public struct ServerConfig: Codable, Sendable, Equatable {
    public var host: String
    public var port: Int
    public var secure: Bool
    /// WebSocket endpoint path (official: `/showdown/websocket`).
    public var socketPath: String
    /// Server that serves `/api/login` + `/api/upkeep` (official:
    /// `play.pokemonshowdown.com`; private servers use their own host).
    public var loginHost: String

    public init(
        host: String = "sim3.psim.us",
        port: Int = 443,
        secure: Bool = true,
        socketPath: String = "/showdown/websocket",
        loginHost: String = "play.pokemonshowdown.com"
    ) {
        self.host = host
        self.port = port
        self.secure = secure
        self.socketPath = socketPath
        self.loginHost = loginHost
    }

    public static let official = ServerConfig()

    public var wsURL: URL? {
        var comps = URLComponents()
        comps.scheme = secure ? "wss" : "ws"
        comps.host = host
        comps.port = (port == (secure ? 443 : 80)) ? nil : port
        comps.path = socketPath
        return comps.url
    }

    public var loginBaseURL: URL? {
        var comps = URLComponents()
        comps.scheme = "https"
        comps.host = loginHost
        return comps.url
    }
}
