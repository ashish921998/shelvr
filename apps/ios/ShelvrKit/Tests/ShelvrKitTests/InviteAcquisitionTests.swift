import Foundation
import Testing
@testable import ShelvrKit

@Test func onlyInviteLinksOfferPublicEntry() throws {
  for path in ["/map", "/item/abc", "/list-invite", "/passport-invite/one/two"] {
    #expect(try PublicInvite(#require(AppLink(path))) == nil)
  }
  let link = try #require(AppLink("https://tryshelvr.app/l/token"))
  let invite = try #require(PublicInvite(link))
  #expect(invite.kind == .list)
  #expect(invite.destination() == nil)
  let joined = try #require(invite.destination(listID: "list"))
  #expect(joined.path == ["shared-list", "list"])
  #expect(joined.query == [URLQueryItem(name: "joined", value: "1")])
}

@Test func anAcceptedComparisonSurvivesRestartAndKeepsItsOriginalAccount() throws {
  let link = try #require(AppLink("shelvr-preview://passport-invite/a%2Fb"))
  let invite = try #require(PublicInvite(link))
  let accepted = AcceptedInvite(invite)
  #expect(AcceptedInvite(invite).id != accepted.id)
  let data = try JSONEncoder().encode(accepted)
  let restored = try JSONDecoder().decode(AcceptedInvite.self, from: data)
  #expect(restored == accepted)
  let owned = try #require(restored.bound(to: "first"))
  #expect(owned.bound(to: "second") == nil)
  #expect(owned.bound(to: "first") == owned)
  let target = try #require(owned.invite.destination())
  #expect(target.path == ["passport-invite", "a/b"])
  #expect(target.query == [URLQueryItem(name: "compare", value: "1")])
}

@MainActor @Test func previewIsReadOnlyAndAnExplicitJoinAloneResumesAfterRestart() throws {
  var disk: AcceptedInvite?
  func launch() -> InviteEntry { InviteEntry(read: { disk }, write: { disk = $0 }) }
  let link = try #require(AppLink("/list-invite/one"))
  let invite = try #require(PublicInvite(link))
  let first = launch()
  #expect(first.route(link))
  #expect(first.preview == invite)
  #expect(disk == nil)
  first.accept(invite)
  #expect(first.preview == nil)
  let restored = launch()
  #expect(restored.accepted?.invite == invite)
  restored.cancel()
  #expect(restored.accepted == nil && disk == nil && restored.preview == invite)
}

@MainActor @Test func aNewLinkSupersedesTheOldAccountBoundActionAndExpiredPassportsHaveNoDestination() throws {
  var disk: AcceptedInvite?
  let state = InviteEntry(read: { disk }, write: { disk = $0 })
  let one = try #require(AppLink("/list-invite/old"))
  let two = try #require(AppLink("/passport-invite/new"))
  let list = try #require(PublicInvite(one))
  let passport = try #require(PublicInvite(two))
  #expect(state.route(one))
  state.accept(list)
  let originalID = state.accepted?.id
  #expect(state.route(two))
  #expect(state.accepted == nil && disk == nil && state.preview == passport)
  state.accept(list)
  #expect(state.accepted == nil)
  state.accept(passport)
  #expect(state.accepted?.id != originalID)
  #expect(passport.destination(passportAvailable: false) == nil)
}

@MainActor @Test func failureToPersistKeepsThePreviewAndDoesNotAuthorizeAJoin() throws {
  let entry = InviteEntry(read: { nil }, write: { _ in throw CocoaError(.fileWriteUnknown) })
  let link = try #require(AppLink("/list-invite/one"))
  let target = try #require(PublicInvite(link))
  #expect(entry.route(link))
  entry.accept(target)
  #expect(entry.failed && entry.preview == target && entry.accepted == nil)
}

@MainActor @Test func consentFromAnAuthenticatedAccountBindsBeforeDispatchAndCompletesBeforeReplacement() throws {
  var disk: AcceptedInvite?
  let entry = InviteEntry(read: { disk }, write: { disk = $0 })
  let first = try #require(AppLink("/list-invite/a")), second = try #require(AppLink("/passport-invite/b"))
  let invite = try #require(PublicInvite(first))
  #expect(entry.route(first))
  entry.accept(invite, account: "a")
  let saved = try #require(disk)
  #expect(saved.bound(to: "b") == nil)
  #expect(entry.beginDispatch(saved.id, session: UUID()))
  entry.cancel()
  #expect(entry.accepted == saved)
  #expect(entry.route(second))
  #expect(entry.accepted == saved && entry.preview == nil)
  #expect(entry.endDispatch(saved.id) == second)
}

@MainActor @Test func retryingAnUnavailableKeychainCannotReviveAnInviteReplacedDuringTheOutage() throws {
  let first = try #require(AppLink("/list-invite/old")), second = try #require(AppLink("/passport-invite/new"))
  let old = try #require(PublicInvite(first))
  var disk: AcceptedInvite? = AcceptedInvite(old)
  var accessible = false
  let entry = InviteEntry(read: {
    guard accessible else { throw CocoaError(.fileReadNoPermission) }
    return disk
  }, write: { value in
    guard accessible else { throw CocoaError(.fileWriteNoPermission) }
    disk = value
  })
  #expect(entry.route(second))
  entry.preview = nil
  accessible = true
  entry.restore()
  #expect(entry.accepted == nil && disk == nil)
}

@MainActor @Test func aCommittedJoinIsConsumedByNavigationBeforeAReplacementPreviewAppears() throws {
  var disk: AcceptedInvite?
  let entry = InviteEntry(read: { disk }, write: { disk = $0 })
  let a = try #require(AppLink("/list-invite/a")), b = try #require(AppLink("/passport-invite/b"))
  let invite = try #require(PublicInvite(a))
  #expect(entry.route(a))
  entry.accept(invite, account: "member")
  let id = try #require(entry.accepted?.id)
  let session = UUID()
  #expect(entry.beginDispatch(id, session: session))
  #expect(entry.route(b))
  let target = try #require(invite.destination(listID: "joined"))
  let resolved = try #require(entry.accepted).resolved(as: .joinedList("joined"))
  #expect(entry.replace(with: resolved))
  #expect(entry.endDispatch(id, navigation: .init(destination: target, account: "member", session: session)) == nil)
  #expect(entry.didNavigate(to: a, account: "member", session: session) == nil)
  #expect(entry.didNavigate(to: target, account: "member", session: session) == b)
}

@MainActor @Test func replacementCannotReviveAnOldInviteAfterRestartWithLockedKeychain() throws {
  let url = URL.temporaryDirectory.appending(path: UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: url) }
  let old = try #require(AppLink("/list-invite/old"))
  let replacement = try #require(AppLink("/passport-invite/new"))
  let first = try #require(PublicInvite(old))
  var key = try JSONEncoder().encode(AcceptedInvite(first)) as Data?
  var accessible = false
  let storage = InviteStorage(marker: SignOutMarker(url: url), readKey: {
    guard accessible else { throw CocoaError(.fileReadNoPermission) }; return key
  }, writeKey: { key = $0; return true }, deleteKey: {
    guard accessible else { return false }; key = nil; return true
  })
  let original = InviteEntry(read: storage.read, write: storage.set)
  #expect(original.route(replacement))
  #expect(original.preview == PublicInvite(replacement))
  original.preview = nil
  accessible = true
  let relaunched = InviteEntry(read: storage.read, write: storage.set)
  #expect(relaunched.accepted == nil && key == nil)
}

@MainActor @Test func ordinaryLinksNeitherRevokeConsentNorDisappearWhenInviteStorageIsUnavailable() throws {
  let invitation = try #require(AppLink("/list-invite/one")), item = try #require(AppLink("/item/saved"))
  let chosen = try #require(PublicInvite(invitation))
  var disk: AcceptedInvite?
  let entry = InviteEntry(read: { disk }, write: { disk = $0 })
  #expect(entry.route(invitation))
  entry.accept(chosen)
  #expect(entry.route(item))
  #expect(disk?.invite == chosen && entry.accepted?.invite == chosen)
  #expect(entry.cancel() == item)
  #expect(disk == nil && entry.preview == nil)
  #expect(entry.route(invitation))
  #expect(!entry.route(item))
  #expect(entry.preview == nil && disk == nil)

  let offline = InviteEntry(read: { throw CocoaError(.fileReadNoPermission) }, write: { _ in
    Issue.record("An ordinary route must not write invite storage")
  })
  #expect(!offline.route(item))
}

@MainActor @Test func committedInviteNavigationCannotPassToAnotherSignIn() throws {
  let entry = InviteEntry(read: { nil }, write: { _ in })
  let link = try #require(AppLink("/passport-invite/one"))
  let unrelated = try #require(AppLink("/item/saved"))
  let invite = try #require(PublicInvite(link))
  let target = try #require(invite.destination())
  let initial = UUID(), replacement = UUID()
  #expect(entry.route(link))
  entry.accept(invite, account: "first")
  let id = try #require(entry.accepted?.id)
  #expect(entry.beginDispatch(id, session: initial))
  #expect(entry.route(unrelated))
  let resolved = try #require(entry.accepted).resolved(as: .passportComparison)
  #expect(entry.replace(with: resolved))
  #expect(entry.endDispatch(id, navigation: .init(destination: target, account: "first", session: initial)) == nil)
  #expect(entry.destination(account: "first", session: initial) == target)
  #expect(entry.destination(account: "second", session: initial) == nil)
  #expect(entry.destination(account: "first", session: replacement) == nil)
  #expect(entry.didNavigate(to: target, account: "second", session: replacement) == nil)
  #expect(entry.discardNavigation(unless: replacement) == unrelated)
  #expect(entry.destination(account: "first", session: initial) == nil)
}

@MainActor @Test func aNewSessionWaitsForTheOldDispatchBeforeDiscardingItsConsent() throws {
  let entry = InviteEntry(read: { nil }, write: { _ in })
  let initial = UUID(), replacement = UUID()
  let link = try #require(AppLink("/list-invite/one"))
  let invite = try #require(PublicInvite(link))
  #expect(entry.route(link))
  entry.accept(invite, account: "first")
  let request = try #require(entry.accepted)
  #expect(entry.beginDispatch(request.id, session: initial))
  #expect(!entry.waitsForDispatch(from: initial))
  #expect(entry.waitsForDispatch(from: replacement))
  #expect(!entry.beginDispatch(request.id, session: replacement))
  #expect(entry.endDispatch(request.id) == nil)
  #expect(!entry.waitsForDispatch(from: replacement))
  #expect(entry.accepted?.bound(to: "second") == nil)
  entry.cancel(keepPreview: false)
  #expect(entry.accepted == nil && entry.preview == nil)
}


@MainActor @Test func committedInviteSurvivesRelaunchUntilTheOwningShellAcknowledgesIt() throws {
  var bytes: Data?
  var canClear = true
  func launch() -> InviteEntry {
    InviteEntry(read: { try bytes.map { try JSONDecoder().decode(AcceptedInvite.self, from: $0) } }, write: { value in
      guard value != nil || canClear else { throw CocoaError(.fileWriteNoPermission) }
      bytes = try value.map { try JSONEncoder().encode($0) }
    })
  }
  let link = try #require(AppLink("/list-invite/one"))
  let invite = try #require(PublicInvite(link))
  let first = launch()
  #expect(first.route(link))
  first.accept(invite, account: "member")
  let resolved = try #require(first.accepted).resolved(as: .joinedList("joined"))
  let id = resolved.id
  #expect(first.replace(with: resolved))

  let restored = launch()
  #expect(restored.accepted == resolved)
  #expect(restored.accepted?.bound(to: "other") == nil)
  let target = try #require(restored.accepted?.destination)
  let session = UUID()
  #expect(restored.beginDispatch(id, session: session))
  #expect(restored.endDispatch(id, navigation: .init(destination: target, account: "member", session: session)) == nil)

  canClear = false
  _ = restored.didNavigate(to: target, account: "member", session: session)
  #expect(restored.failed)
  #expect(restored.destination(account: "member", session: session) == target)
  #expect(launch().accepted == resolved)

  canClear = true
  _ = restored.didNavigate(to: target, account: "member", session: session)
  #expect(!restored.failed)
  #expect(restored.destination(account: "member", session: session) == nil)
  #expect(launch().accepted == nil)
}
