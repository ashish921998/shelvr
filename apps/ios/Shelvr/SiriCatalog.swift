import Foundation
import ShelvrKit

struct AppIntentEntityRecord: Sendable {
  let id: String
  let title: String
  let metadata: [String: String]
}

protocol AppIntentEntityRecordConvertible {
  init(record: AppIntentEntityRecord)
}

@MainActor enum ShelvrCatalog {
  private struct Folder: Decodable {
    let _id: String
    let name: String
  }
  private struct Save: Decodable {
    let _id: String
    let _creationTime: Double
    let note: String?
    let title: String?
    let type: String
  }

  static func spaces(matching ids: [String]? = nil) async -> [AppIntentEntityRecord] {
    let rows: [Folder] = await rows("spaces:listSpaces")
    return rows.filter { ids?.contains($0._id) ?? true }.map {
      AppIntentEntityRecord(id: $0._id, title: $0.name, metadata: [:])
    }
  }

  static func items(matching ids: [String]? = nil) async -> [AppIntentEntityRecord] {
    let rows: [Save] = await rows("items:listItems")
    return rows.filter { $0.type == "note" && (ids?.contains($0._id) ?? true) }.map {
      AppIntentEntityRecord(id: $0._id, title: $0.title ?? $0.note ?? "",
        metadata: ["kind": $0.type, "text": $0.note ?? "", "savedAt": String($0._creationTime)])
    }
  }

  nonisolated static func matches(_ record: AppIntentEntityRecord, query: String) -> Bool {
    let text = [record.title, record.metadata["text"] ?? ""].joined(separator: " ")
    return query.split(whereSeparator: \.isWhitespace).allSatisfy { text.localizedCaseInsensitiveContains(String($0)) }
  }

  private static func rows<T: Decodable>(_ query: String) async -> [T] {
    let backend = AppEnvironment.sharedBackend
    await backend.start()
    guard backend.status == .signedIn else { return [] }
    do {
      for try await rows in backend.query(query, as: [T].self) { return rows }
    } catch {}
    return []
  }
}
