// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PSData",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "PSData", targets: ["PSData"])
    ],
    dependencies: [
        .package(path: "../PSProtocol")
    ],
    targets: [
        .target(
            name: "PSData",
            dependencies: ["PSProtocol"],
            resources: [.copy("Resources/dex")]
        ),
        .testTarget(name: "PSDataTests", dependencies: ["PSData"])
    ]
)
