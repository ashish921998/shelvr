import Foundation

@MainActor public final class SpotlightReindexQueue {
  private var tail: Task<Void, Error>?
  private var revision: UInt64 = 0

  public init() {}

  public func run(_ rebuild: @escaping @MainActor () async throws -> Void) async throws {
    revision += 1
    let job = revision
    let previous = tail
    let current = Task {
      if let previous { _ = await previous.result }
      try Task.checkCancellation()
      try await rebuild()
    }
    tail = current
    defer { if revision == job { tail = nil } }
    try await withTaskCancellationHandler {
      try await current.value
    } onCancel: {
      current.cancel()
    }
  }
}
