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
  struct Folder: Decodable {
    let _id: String
    let name: String
  }
  private typealias Save = SearchableSave

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
      records = await readySaves(account: account).filter { $0.type == "note" }
        .map { record($0, as: $0._id, fullContent: false) }
    }
    return await permits(account) ? records : []
  }

  static func searchSaves(matching ids: [String]? = nil) async -> [SearchableSave] {
    guard let account = SiriCredential.current(), await permits(account) else { return [] }
    let saves: [Save]
    if let ids {
      var found: [Save] = []
      for id in ids {
        guard !Task.isCancelled, SiriCredential.current()?.token == account.token else { return [] }
        if let save: Save = await first("items:getItem", args: ["id": id]), save.status == "ready" { found.append(save) }
      }
      saves = found
    } else {
      saves = await readySaves(account: account)
    }
    return await permits(account) ? saves : []
  }

  private static func readySaves(account: SiriCredential) async -> [Save] {
    await SearchableSavePage.latestReady { cursor in
      guard SiriCredential.current()?.token == account.token else { return nil }
      let pagination: [String: ConvexEncodable?] = ["numItems": 100.0, "cursor": cursor]
      return await first("items:listItemsPage", args: ["paginationOpts": pagination])
    } ?? []
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
    return !Task.isCancelled && plan.entitled && AppEnvironment.sharedBackend.userID == account.owner && SiriCredential.current()?.token == account.token
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
