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
