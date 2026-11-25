import AppIntents
import ShelvrKit

@MainActor enum SiriNavigation {
  static let shared = SiriNavigationRequests()
}

#if compiler(>=6.4)
@available(iOS 27.0, *)
@AppIntent(schema: .system.searchInApp)
struct SearchShelvrIntent {
  static let supportedModes: IntentModes = .foreground(.immediate)
  static let searchScopes: [StringSearchScope] = [.general]
  var criteria: StringSearchCriteria

  @MainActor func perform() async throws -> some IntentResult {
    SiriNavigation.shared.requestLibrary()
    return .result()
  }
}

@available(iOS 27.0, *)
@AppIntent(schema: .system.open)
struct OpenSpaceIntent {
  static let supportedModes: IntentModes = .foreground(.immediate)
  var target: SpaceEntity

  @MainActor func perform() async throws -> some IntentResult {
    SiriNavigation.shared.requestLibrary()
    return .result()
  }
}
#endif
