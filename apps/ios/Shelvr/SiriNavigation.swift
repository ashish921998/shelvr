import AppIntents
import Foundation
import Observation

@MainActor @Observable final class SiriNavigation {
  static let shared = SiriNavigation()
  var libraryRequest: UUID?
}

#if compiler(>=6.4)
@available(iOS 27.0, *)
@AppIntent(schema: .system.searchInApp)
struct SearchShelvrIntent {
  static let supportedModes: IntentModes = .foreground(.immediate)
  static let searchScopes: [StringSearchScope] = [.general]
  var criteria: StringSearchCriteria

  @MainActor func perform() async throws -> some IntentResult {
    SiriNavigation.shared.libraryRequest = UUID()
    return .result()
  }
}

@available(iOS 27.0, *)
@AppIntent(schema: .system.open)
struct OpenSpaceIntent {
  static let supportedModes: IntentModes = .foreground(.immediate)
  var target: SpaceEntity

  @MainActor func perform() async throws -> some IntentResult {
    SiriNavigation.shared.libraryRequest = UUID()
    return .result()
  }
}
#endif
