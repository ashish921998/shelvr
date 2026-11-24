import Foundation
import ConvexMobile

extension Backend {
  public func changeCityStamp(_ city: String, add: Bool) async throws -> Bool {
    try await client.mutation(add ? "cityStamps:addCityStamp" : "cityStamps:removeCityStamp", with: ["city": city])
  }

  public func sharePassport() async throws -> URL {
    let token: String = try await client.mutation("passportShares:sharePassport")
    return passportURL(token: token)
  }

  public func passportURL(token: String) -> URL {
    let base = environment.variant == .development ? "shelvr-preview://passport-invite" : "https://tryshelvr.app/passport"
    return URL(string: base)!.appending(component: token)
  }

  public func stopPassportSharing() async throws {
    try await client.mutation("passportShares:stopSharingPassport")
  }
}

extension Backend {
  public func removePassportStamp(_ stamp: PassportStamp) async throws {
    var arguments: [String: ConvexEncodable?] = ["name": stamp.name]
    if let lat = stamp.lat, let lng = stamp.lng {
      let spot: [String: ConvexEncodable?] = ["lat": lat, "lng": lng]
      arguments["spot"] = spot
    }
    if let id = stamp.itemId {
      arguments["itemId"] = id
      arguments["visited"] = false
      try await client.mutation("placeVisits:setVisited", with: arguments)
    } else {
      try await client.mutation("placeVisits:removeListStamp", with: arguments)
    }
  }
}
