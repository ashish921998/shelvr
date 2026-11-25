import AppIntents
import ShelvrKit
#if canImport(VisualIntelligence)
import VisualIntelligence

@available(iOS 26.0, *)
@AppIntent(schema: .visualIntelligence.semanticContentSearch)
struct VisualSearchIntent {
  static let supportedModes: IntentModes = .foreground(.immediate)
  var semanticContent: SemanticContentDescriptor

  @MainActor func perform() async throws -> some IntentResult {
    let backend = AppEnvironment.sharedBackend
    await backend.start()
    guard let owner = backend.userID, let account = SiriCredential.current(), account.owner == owner else {
      throw CocoaError(.userCancelled)
    }
    let session = backend.sessionGeneration
    guard await ShelvrCatalog.permits(account), backend.sessionGeneration == session else { throw CocoaError(.userCancelled) }
    SiriNavigation.shared.requestVisualSearch(labels: semanticContent.labels, owner: owner, session: session)
    return .result()
  }
}

@available(iOS 26.0, *)
struct ItemVisualQuery: IntentValueQuery {
  @MainActor func values(for input: SemanticContentDescriptor) async throws -> [ItemEntity] {
    let labels = input.labels
    guard !labels.isEmpty, let account = SiriCredential.current() else { return [] }
    let rows = await SearchableSave.visualMatches(in: ShelvrCatalog.searchSaves(), labels: labels, copy: Copy())
    guard await ShelvrCatalog.permits(account) else { return [] }
    return rows.map { ItemEntity($0) }
  }
}
#endif
