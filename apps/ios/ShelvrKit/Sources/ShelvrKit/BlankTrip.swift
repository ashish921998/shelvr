import ConvexMobile
import Foundation

public enum BlankTrip {
  public static let countryCodes = Locale.Region.isoRegions.map(\.identifier).filter {
    $0.count == 2 && !["EU", "EZ", "QO", "UN"].contains($0)
  }

  public static func limitedName(_ name: String) -> String {
    var count = 0
    return String(name.prefix { character in
      count += character.utf16.count
      return count <= 80
    })
  }

  public static func dayCount(start: Date, end: Date, calendar: Calendar = .current) -> Int {
    (calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: calendar.startOfDay(for: end)).day ?? 0) + 1
  }

  public static func dateKey(_ value: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: value)
  }
}

extension Backend {
  public func createBlankTrip(name: String, countries: [String], city: String, days: Int, start: Date?, stay: TripSearchPlace?, cover: String?) async throws -> String {
    var args: [String: ConvexEncodable?] = ["name": name, "countries": countries.map { $0 as ConvexEncodable? }, "dayCount": Double(days)]
    if !city.isEmpty { args["city"] = city }
    if let start { args["startDate"] = BlankTrip.dateKey(start) }
    if let stay { args["stay"] = ["name": stay.name, "lat": stay.lat, "lng": stay.lng] as [String: ConvexEncodable?] }
    if let cover { args["cover"] = cover }
    return try await client.mutation("tripPlannerData:createBlankTrip", with: args)
  }

  public func tripStays(_ query: String, countries: [String], city: String, locale: String) async throws -> TripMatches {
    let args: [String: ConvexEncodable?] = ["query": query, "countries": countries.map { $0 as ConvexEncodable? }, "city": city, "locale": locale]
    return try await client.action("tripPlanner:searchTripStays", with: args)
  }
}
