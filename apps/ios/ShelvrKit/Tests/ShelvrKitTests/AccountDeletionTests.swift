import Testing
@testable import ShelvrKit

@MainActor
struct AccountDeletionTests {
  @Test func repeatedDeletionAndSignOutWaitForOneAcceptedDeletion() async throws {
    let deletion = AccountDeletion()
    let started = Gate(), finish = Gate(), joined = Gate(), waiting = Gate()
    var events: [String] = []
    let first = Task {
      try await deletion.perform(allowed: true) {
        events.append("request")
        started.open()
        await finish.wait()
      } afterAcceptance: { events.append("cleared") }
    }
    await started.wait()
    let duplicate = Task {
      joined.open()
      try await deletion.perform(allowed: false) { events.append("duplicate") }
        afterAcceptance: { events.append("duplicate cleanup") }
    }
    let signOut = Task {
      waiting.open()
      await deletion.wait()
      events.append("sign out")
    }
    await joined.wait(); await waiting.wait()
    #expect(deletion.isRunning)
    #expect(events == ["request"])
    finish.open()
    try await first.value
    try await duplicate.value
    await signOut.value
    #expect(events == ["request", "cleared", "sign out"])
    #expect(!deletion.isRunning)
  }

  @Test func failureKeepsSessionUntilAnAcceptedRetryClearsTheVault() async throws {
    let vault = MemoryVault(tokens("deleted"))
    let session = AuthSession(transport: FakeTransport([]), vault: vault)
    await session.restore()
    let deletion = AccountDeletion()
    do {
      try await deletion.perform(allowed: true) { throw AuthSessionError.signInRefused }
        afterAcceptance: { await session.forgetDeletedAccount() }
      Issue.record("Deletion unexpectedly succeeded")
    } catch {}
    #expect(await session.isSignedIn)
    #expect(vault.tokens != nil)
    #expect(!deletion.isRunning)
    try await deletion.perform(allowed: true) {} afterAcceptance: { await session.forgetDeletedAccount() }
    #expect(await !session.isSignedIn)
    #expect(vault.tokens == nil)
  }
}
