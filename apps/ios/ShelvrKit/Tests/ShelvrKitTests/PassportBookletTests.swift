import Foundation
import Testing
@testable import ShelvrKit

private func cityStamp(_ city: String, _ at: Double) -> PassportCityStamp {
  PassportCityStamp(city: city, country: "XX", stampedAt: at)
}

@Test func bookletOrdersCitiesByStampDate() {
  let pages = PassportBooklet.pages(cities: [cityStamp("paris", 3000), cityStamp("lisbon", 1000), cityStamp("rome", 2000)])
  #expect(pages.map(\.id) == ["cover", "lisbon", "rome", "paris"])
}

@Test func bookletDropsUnknownCitiesAndCollapsesDuplicates() {
  let pages = PassportBooklet.pages(cities: [cityStamp("atlantis", 1), cityStamp("paris", 5000), cityStamp("paris", 2000)])
  #expect(pages.map(\.id) == ["cover", "paris"])
  guard case .city(_, let date) = pages[1] else {
    Issue.record("expected a city page")
    return
  }
  #expect(date == Date(timeIntervalSince1970: 2))
}

@Test func bookletWithNoStampsHasOnlyTheCover() {
  #expect(PassportBooklet.pages(cities: []).map(\.id) == ["cover"])
}
