import Foundation
import Testing
@testable import ShelvrKit

@Test func onlyInviteLinksOfferPublicEntry() throws {
  for path in ["/map", "/item/abc", "/list-invite", "/passport-invite/one/two"] {
    #expect(try PublicInvite(#require(AppLink(path))) == nil)
  }
  let invite = try #require(PublicInvite(#require(AppLink("https://tryshelvr.app/l/token"))))
  #expect(invite.kind == .list)
  #expect(invite.destination() == nil)
  let joined = try #require(invite.destination(listID: "list"))
  #expect(joined.path == ["shared-list", "list"])
  #expect(joined.query == [URLQueryItem(name: "joined", value: "1")])
}

@Test func anAcceptedComparisonSurvivesRestartAndKeepsItsOriginalAccount() throws {
  let invite = try #require(PublicInvite(#require(AppLink("shelvr-preview://passport-invite/a%2Fb"))))
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
