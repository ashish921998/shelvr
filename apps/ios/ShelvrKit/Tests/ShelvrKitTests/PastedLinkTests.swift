import ConvexMobile
import Testing
@testable import ShelvrKit

@Test func extractsTheSameLinksAsTheExpoField() {
  for (input, expected) in [
    ("https://example.com/a!", "https://example.com/a!"),
    ("  bücher.de  ", "bücher.de"),
    ("Read this https://example.org/Function_(math)).", "https://example.org/Function_(math)"),
    ("See https://example.org/x. https://example.org/y", "https://example.org/x")
  ] {
    #expect(PastedLink(input)?.url == expected)
  }
  for invalid in ["see example.com later", "hello", "  "] { #expect(PastedLink(invalid) == nil) }
}

@Test func retriesOnlyReuseAnOperationForTheSameLink() throws {
  let first = try #require(PastedLink("example.com"))
  #expect(PastedLink(" example.com ", retrying: first)?.operationID == first.operationID)
  #expect(PastedLink("example.org", retrying: first)?.operationID != first.operationID)
}

@Test func distinguishesPlanDenialsFromTransientFailures() {
  #expect(PastedLink.requiresPro(ClientError.ConvexError(data: #"{"code":"pro_required","message":"Pro required"}"#)))
  #expect(!PastedLink.requiresPro(ClientError.ServerError(msg: "network")))
}
