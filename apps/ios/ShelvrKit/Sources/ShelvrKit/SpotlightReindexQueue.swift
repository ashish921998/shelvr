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
      guard job == revision else { throw CancellationError() }
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

@MainActor public enum SpotlightReindexRead {
  @MainActor private final class Pending<Value: Sendable> {
    var answer: CheckedContinuation<Value, any Error>?
    var reader: Task<Void, Never>?
    var timer: Task<Void, Never>?

    func finish(_ result: Result<Value, any Error>) {
      guard let continuation = answer else { return }
      answer = nil
      reader?.cancel()
      timer?.cancel()
      reader = nil
      timer = nil
      continuation.resume(with: result)
    }
  }

  public static func value<Value: Sendable>(before deadline: ContinuousClock.Instant,
    _ read: @escaping @MainActor () async throws -> Value) async throws -> Value {
    let pending = Pending<Value>()
    return try await withTaskCancellationHandler {
      try Task.checkCancellation()
      guard ContinuousClock.now < deadline else { throw URLError(.timedOut) }
      return try await withCheckedThrowingContinuation { continuation in
        pending.answer = continuation
        pending.reader = Task { [weak pending] in
          do {
            let value = try await read()
            pending?.finish(.success(value))
          } catch { pending?.finish(.failure(error)) }
        }
        pending.timer = Task { [weak pending] in
          do { try await Task.sleep(until: deadline, clock: .continuous) } catch { return }
          pending?.finish(.failure(URLError(.timedOut)))
        }
      }
    } onCancel: {
      Task { @MainActor in pending.finish(.failure(CancellationError())) }
    }
  }
}
