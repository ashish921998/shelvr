import AppIntents
import ShelvrKit
#if canImport(VisualIntelligence)
import VisualIntelligence

@available(iOS 26.0, *)
@AppIntent(schema: .visualIntelligence.semanticContentSearch)
struct VisualSearchIntent {
  var semanticContent: SemanticContentDescriptor

  @MainActor func perform() async throws -> some IntentResult {
    SiriNavigation.shared.requestLibrary()
    return .result()
  }
}

@available(iOS 26.0, *)
struct ItemVisualQuery: IntentValueQuery {
  func values(for input: SemanticContentDescriptor) async throws -> [ItemEntity] {
    let labels = input.labels
    guard !labels.isEmpty else { return [] }
    let copy = Copy()
    let candidates = await ShelvrCatalog.searchSaves()
    return candidates.map { ($0, $0.visualScore(labels: labels, copy: copy)) }
      .filter { $0.1 > 0 }.sorted { $0.1 > $1.1 }.prefix(12).map { ItemEntity($0.0) }
  }
}
#endif
