import ConvexMobile
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
      struct Page: Decodable {
        let page: [Save]
        let continueCursor: String
        let isDone: Bool
      }
      var cursor: String?
      var scanned = 0
      var seenCursors = Set<String>()
      while scanned < 300 {
        let pagination: [String: ConvexEncodable?] = ["numItems": Double(min(100, 300 - scanned)), "cursor": cursor]
        guard let page: Page = await first("items:listItemsPage", args: ["paginationOpts": pagination]) else { break }
        records += page.page.filter { $0.type == "note" && $0.status == "ready" }
          .map { record($0, as: $0._id, fullContent: false) }
        scanned += page.page.count
        if page.isDone || !seenCursors.insert(page.continueCursor).inserted { break }
        cursor = page.continueCursor
      }
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
        guard let delivery = ShareInbox.system()?.queuedSiriDelivery(operationID: operation, owner: owner)
        else { return nil }
        let text: String
        switch delivery.content {
        case .link(let url): text = url
        case .note(let note): text = note
        case .image: text = Copy()("item.photo")
        }
        let firstLine = text.split(separator: "\n", maxSplits: 1).first.map(String.init) ?? text
        return AppIntentEntityRecord(id: id, title: String(firstLine.prefix(80)), metadata: ["kind": "note", "text": text])
      }
    }
    guard let item: Save = await first("items:getItem", args: ["id": itemID]) else { return nil }
    return record(item, as: id, fullContent: true)
  }

  private static func record(_ save: Save, as identifier: String, fullContent: Bool) -> AppIntentEntityRecord {
    let title = save.title ?? save.note ?? save.url ?? Copy()("item.savedItem")
    let value = save.type == "link" ? save.url : save.note
    let content = SiriText.entityContent(kind: save.type, value: value, title: title, photoLabel: Copy()("item.photo"))
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

  private static func first<T: Decodable>(_ query: String, args: [String: ConvexEncodable?] = [:]) async -> T? {
    let backend = AppEnvironment.sharedBackend
    await backend.start()
    guard backend.status == .signedIn else { return nil }
    do {
      for try await result in backend.query(query, with: args, as: T?.self) { return result }
    } catch {}
    return nil
  }
}
