import Foundation

@MainActor
final class AccountDeletion {
  private var pending: Task<Void, Error>?
  var isRunning: Bool { pending != nil }

  func wait() async { _ = await pending?.result }

  func perform(allowed: Bool, remove: @escaping @MainActor () async throws -> Void,
    afterAcceptance: @escaping @MainActor () async -> Void) async throws {
    if let pending { return try await pending.value }
    guard allowed else { throw AuthSessionError.notSignedIn }
    let operation = Task {
      try await remove()
      await afterAcceptance()
    }
    pending = operation
    defer { pending = nil }
    try await operation.value
  }
}
