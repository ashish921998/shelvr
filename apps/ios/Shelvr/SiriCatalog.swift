import Foundation
import ShelvrKit
import ShelvrInbox

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
    let status: String
    let url: String?
  }

  private struct Plan: Decodable {
    let status: String
    let expiresAt: Double?
    var entitled: Bool {
      status == "lifetime" || (["pro", "trialing"].contains(status) && (expiresAt ?? 0) > Date().timeIntervalSince1970 * 1000)
    }
  }

  static func spaces(matching ids: [String]? = nil) async -> [AppIntentEntityRecord] {
    guard let account = SiriCredential.current(), await permits(account),
      let rows: [Folder] = await first("spaces:listSpaces"), await permits(account) else { return [] }
    return rows.filter { ids?.contains($0._id) ?? true }.map {
      AppIntentEntityRecord(id: $0._id, title: $0.name, metadata: [:])
    }
  }

  static func items(matching ids: [String]? = nil) async -> [AppIntentEntityRecord] {
    guard let account = SiriCredential.current(), await permits(account) else { return [] }
    var records: [AppIntentEntityRecord] = []
    if let ids {
      for id in ids {
        if let record = await resolve(id, owner: account.owner) { records.append(record) }
      }
    } else {
      let rows: [Save] = await first("items:listItems") ?? []
      records = rows.filter { $0.type == "note" && $0.status == "ready" }.map { record($0, as: $0._id, fullContent: false) }
    }
    return await permits(account) ? records : []
  }

  private static func resolve(_ id: String, owner: String) async -> AppIntentEntityRecord? {
    struct Operation: Decodable { let itemId: String? }
    var itemID = id
    if id.hasPrefix("queued:") {
      let operation = String(id.dropFirst("queued:".count))
      let completed: Operation? = await first("items:getImportOperation", args: ["operationId": operation])
      if let realID = completed?.itemId { itemID = realID }
      else {
        guard let inbox = ShareInbox.system(), inbox.activeOwner == owner else { return nil }
        for batch in (try? inbox.batches()) ?? [] where (try? inbox.owner(of: batch)) == owner {
          for file in (try? inbox.manifests(in: batch)) ?? [] {
            guard let bytes = try? Data(contentsOf: file), let payload = try? JSONDecoder().decode(InboxPayload.self, from: bytes),
              payload.operationID == operation, payload.siri == true else { continue }
            let text = payload.kind == .image ? Copy()("item.photo") : payload.value
            return AppIntentEntityRecord(id: id, title: text, metadata: ["kind": "note", "text": text])
          }
        }
        return nil
      }
    }
    guard let item: Save = await first("items:getItem", args: ["id": itemID]) else { return nil }
    return record(item, as: id, fullContent: true)
  }

  private static func record(_ save: Save, as identifier: String, fullContent: Bool) -> AppIntentEntityRecord {
    let title = save.title ?? save.note ?? save.url ?? Copy()("item.savedItem")
    let content = save.note ?? title
    return AppIntentEntityRecord(id: identifier, title: String(title.prefix(80)),
      metadata: ["kind": "note", "text": fullContent ? content : String(content.prefix(600)), "savedAt": String(save._creationTime)])
  }

  nonisolated static func matches(_ record: AppIntentEntityRecord, query: String) -> Bool {
    let text = [record.title, record.metadata["text"] ?? ""].joined(separator: " ")
    return query.split(whereSeparator: \.isWhitespace).allSatisfy { text.localizedCaseInsensitiveContains(String($0)) }
  }

  private static func permits(_ account: SiriCredential) async -> Bool {
    guard let plan: Plan = await first("subscriptions:getEntitlement") else { return false }
    return plan.entitled && SiriCredential.current()?.token == account.token
  }

  private static func first<T: Decodable>(_ query: String, args: [String: String] = [:]) async -> T? {
    let backend = AppEnvironment.sharedBackend
    await backend.start()
    guard backend.status == .signedIn else { return nil }
    do {
      for try await result in backend.query(query, with: args, as: T?.self) { return result }
    } catch {}
    return nil
  }
}
