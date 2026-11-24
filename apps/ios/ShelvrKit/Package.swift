// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "ShelvrKit",
  platforms: [.iOS(.v18), .macOS("26.2")],
  products: [.library(name: "ShelvrKit", targets: ["ShelvrKit"]),
    .library(name: "ShelvrInbox", targets: ["ShelvrInbox"])],
  dependencies: [
    .package(url: "https://github.com/get-convex/convex-swift", exact: "0.8.2")
  ],
  targets: [
    .target(name: "ShelvrInbox"),
    .target(
      name: "ShelvrKit",
      dependencies: [.product(name: "ConvexMobile", package: "convex-swift")]
    ),
    .testTarget(name: "ShelvrKitTests", dependencies: ["ShelvrKit", "ShelvrInbox"], resources: [.process("Fixtures")]),
  ]
)
