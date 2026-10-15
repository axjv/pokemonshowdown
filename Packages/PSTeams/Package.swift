// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PSTeams",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "PSTeams", targets: ["PSTeams"])
    ],
    dependencies: [
        .package(path: "../PSProtocol")
    ],
    targets: [
        .target(name: "PSTeams", dependencies: ["PSProtocol"]),
        .testTarget(name: "PSTeamsTests", dependencies: ["PSTeams"])
    ]
)
