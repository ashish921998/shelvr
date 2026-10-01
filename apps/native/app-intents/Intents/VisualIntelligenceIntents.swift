import AppIntents
internal import ExpoAppIntents
import Foundation

// Visual Intelligence (camera or screenshot search, iOS 26+) shows matching Shelvr saves.
#if canImport(VisualIntelligence)
import VisualIntelligence

/// "More results" from a Visual Intelligence search: opens Shelvr's Search with the labels the
/// system recognized.
@available(iOS 26.0, *)
@AppIntent(schema: .visualIntelligence.semanticContentSearch)
struct VisualSearchIntent {
  var semanticContent: SemanticContentDescriptor

  @MainActor
  func perform() async throws -> some IntentResult {
    let query = semanticContent.labels.prefix(3).joined(separator: " ")
    ShelvrIntentLog.record("VisualSearchIntent.perform labels=\(semanticContent.labels.count)")
    await AppIntentDispatcher.shared.dispatch(name: "search", params: ["query": .string(query)])
    return .result()
  }
}

/// Answers Visual Intelligence (camera or screenshot search) with matching Shelvr saves.
@available(iOS 26.0, *)
struct ItemVisualQuery: IntentValueQuery {
  func values(for input: SemanticContentDescriptor) async throws -> [ItemEntity] {
    let labels = input.labels
    ShelvrIntentLog.record("ItemVisualQuery labels=\(labels.count)")
    guard !labels.isEmpty else { return [] }
    return await ShelvrCatalog.items()
      .map { ($0, ShelvrCatalog.score($0, labels: labels)) }
      .filter { $0.1 > 0 }
      .sorted { $0.1 > $1.1 }
      .prefix(12)
      .map { ItemEntity(record: $0.0) }
  }
}
#endif
