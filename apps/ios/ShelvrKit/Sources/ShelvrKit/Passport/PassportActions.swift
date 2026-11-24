import Foundation
import ConvexMobile

extension Backend {
  public func changeCityStamp(_ city: String, add: Bool) async throws -> Bool {
    try await client.mutation(add ? "cityStamps:addCityStamp" : "cityStamps:removeCityStamp", with: ["city": city])
  }

  public func sharePassport() async throws -> URL {
    let token: String = try await client.mutation("passportShares:sharePassport")
    return URL(string: "https://tryshelvr.app")!.appending(component: "passport").appending(component: token)
  }

  public func stopPassportSharing() async throws {
    try await client.mutation("passportShares:stopSharingPassport")
  }
}
