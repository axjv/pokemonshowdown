import XCTest
@testable import PSNet
import PSProtocol

final class ServerConfigTests: XCTestCase {
    func testOfficialDefaults() throws {
        let config = ServerConfig.official
        XCTAssertEqual(config.wsURL?.absoluteString, "wss://sim3.psim.us/showdown/websocket")
        XCTAssertEqual(config.loginBaseURL?.absoluteString, "https://play.pokemonshowdown.com")
    }

    func testPrivateServerURL() throws {
        let config = ServerConfig(host: "ps.myserver.net", port: 8000, secure: false,
                                  loginHost: "ps.myserver.net")
        XCTAssertEqual(config.wsURL?.absoluteString, "ws://ps.myserver.net:8000/showdown/websocket")
        XCTAssertEqual(config.loginBaseURL?.host, "ps.myserver.net")
    }

    func testRoundTripsThroughCodable() throws {
        let data = try JSONEncoder().encode(ServerConfig(host: "sim1.psim.us"))
        XCTAssertEqual(try JSONDecoder().decode(ServerConfig.self, from: data),
                       ServerConfig(host: "sim1.psim.us"))
    }
}

final class LoginServerTests: XCTestCase {
    func testChallstrRejoinsChunks() {
        let line = PSLine(parsing: "|challstr|4|abcdef1234567890|somechallengeid")
        XCTAssertEqual(LoginServer.challstr(from: line), "4|abcdef1234567890|somechallengeid")
        XCTAssertNil(LoginServer.challstr(from: PSLine(parsing: "|updateuser|x")))
    }

    func testLoginRequestShape() {
        let request = LoginServer.loginRequest(username: "ash", password: "p@ss",
                                               challstr: "4|a|b")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString,
                       "https://play.pokemonshowdown.com/api/login")
        let body = String(decoding: request.httpBody!, as: UTF8.self)
        XCTAssertEqual(body, "name=ash&pass=p%40ss&challstr=4%7Ca%7Cb")
    }

    func testUpkeepRequest() {
        let request = LoginServer.upkeepRequest(challstr: "4|x|y")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertTrue(request.url!.absoluteString
            .hasPrefix("https://play.pokemonshowdown.com/api/upkeep?challstr=4%7Cx%7Cy"))
    }

    func testParsePrefixedJSON() {
        let body = "] {\"actionsuccess\":true,\"loggedin\":true,\"assertion\":\"tok3n\"}"
        let result = LoginServer.parseLoginResponse(body)
        XCTAssertEqual(result?.success, true)
        XCTAssertEqual(result?.assertion, "tok3n")
        XCTAssertNil(result?.reason)
    }

    func testParseFailureReason() {
        let body = "] {\"actionsuccess\":false,\"loggedin\":false,\"actionreason\":\"\\`User not found\\` or password incorrect\"}"
        let result = LoginServer.parseLoginResponse(body)
        XCTAssertEqual(result?.success, false)
        XCTAssertEqual(result?.reason, "`User not found` or password incorrect")
    }

    func testParseGarbage() {
        XCTAssertNil(LoginServer.parseLoginResponse("<html>502</html>"))
    }

    func testTRNCommand() {
        XCTAssertEqual(LoginServer.trnCommand(username: "Ash", assertion: "t0k"),
                       "/trn Ash,0,t0k")
    }
}
