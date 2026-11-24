import Testing
@testable import ShelvrKit

@Test func cachedAnalyticsIdentityCompletesOnlyAfterVerifiedAuthentication() {
  var state = AnalyticsIdentity()
  let offline = state.update("first", authenticated: false)
  #expect(offline.identify && !offline.complete)
  let restored = state.update("first", authenticated: true)
  #expect(!restored.identify && restored.complete)
  let repeated = state.update("first", authenticated: true)
  #expect(!repeated.identify && !repeated.complete)
  let signedOut = state.update(nil, authenticated: false)
  #expect(!signedOut.identify && !signedOut.complete)
  let newSession = state.update("first", authenticated: true)
  #expect(newSession.identify && newSession.complete)
}
