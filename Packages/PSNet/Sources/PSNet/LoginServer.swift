import Foundation
import PSProtocol

/// Outcome of a `api/login` / `api/upkeep` round trip.
public struct LoginResult: Sendable, Equatable {
    public let success: Bool
    public let loggedIn: Bool
    /// Send this back with `/trn NAME,0,ASSERTION`.
    public let assertion: String?
    /// Human-readable failure (`actionreason`).
    public let reason: String?

    public init(success: Bool, loggedIn: Bool, assertion: String?, reason: String?) {
        self.success = success
        self.loggedIn = loggedIn
        self.assertion = assertion
        self.reason = reason
    }
}

/// The login leg of PS auth (`docs/PROTOCOL-NOTES.md`): after the server
/// sends `|challstr|`, POST the credentials, get an assertion, echo it via
/// `/trn`. Requests are pure builders and responses pure parsers, so the
/// whole flow is unit-testable without a network.
public enum LoginServer {
    private struct LoginJSON: Decodable {
        var actionsuccess: Bool?
        var loggedin: Bool?
        var assertion: String?
        var actionreason: String?
    }

    /// `POST https://play.pokemonshowdown.com/api/login` form-encoded.
    public static func loginRequest(
        username: String, password: String, challstr: String,
        base: URL = ServerConfig.official.loginBaseURL!
    ) -> URLRequest {
        var request = URLRequest(url: base.appendingPathComponent("api/login"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = formData([("name", username), ("pass", password), ("challstr", challstr)])
        return request
    }

    /// `GET /api/upkeep?challstr=` — checks the saved-cookie login path;
    /// we keep it for parity, cookies are not used in v1.
    public static func upkeepRequest(challstr: String, base: URL = ServerConfig.official.loginBaseURL!) -> URLRequest {
        var comps = URLComponents(url: base.appendingPathComponent("api/upkeep"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "challstr", value: challstr)]
        var request = URLRequest(url: comps.url!)
        request.httpMethod = "GET"
        return request
    }

    /// PS prefixes its JSON APIs with `]` to defang direct JSON hijacking.
    public static func parseLoginResponse(_ body: String) -> LoginResult? {
        let trimmed = body.hasPrefix("]") ? String(body.dropFirst()) : body
        guard let data = trimmed.data(using: .utf8),
              let json = try? JSONDecoder().decode(LoginJSON.self, from: data) else {
            return nil
        }
        return LoginResult(
            success: json.actionsuccess ?? false,
            loggedIn: json.loggedin ?? false,
            assertion: json.assertion,
            reason: json.actionreason)
    }

    /// The `/trn` line to send (0 = default avatar).
    public static func trnCommand(username: String, assertion: String) -> String {
        "/trn \(username),0,\(assertion)"
    }

    /// Extract the challstr from a `|challstr|…` line. It may itself contain
    /// `|` (the official format is `base64modpubkey|challengeid` split across
    /// chunks), so re-join every part.
    public static func challstr(from line: PSLine) -> String? {
        guard line.isProtocolLine, line.type == "challstr" else { return nil }
        let joined = line.joinedParts()
        return joined.isEmpty ? nil : joined
    }

    static func formData(_ pairs: [(String, String)]) -> Data {
        let allowed = CharacterSet(charactersIn:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        let encoded = pairs.map { key, value in
            let v = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
            let k = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
            return "\(k)=\(v)"
        }.joined(separator: "&")
        return Data(encoded.utf8)
    }
}
