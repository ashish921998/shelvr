import Testing
@testable import ShelvrKit

@MainActor @Test func aLibraryRequestReceivedBeforeTheRootAppearsIsConsumedOnce() throws {
  let navigation = SiriNavigationRequests()
  navigation.requestLibrary()
  let pending = try #require(navigation.pending)
  #expect(navigation.consume(pending)?.path == ["home"])
  #expect(navigation.pending == nil)
  #expect(navigation.consume(pending) == nil)
}

@MainActor @Test func aStaleSiriObserverCannotConsumeANewerRequest() throws {
  let navigation = SiriNavigationRequests()
  navigation.requestLibrary()
  let first = try #require(navigation.pending)
  navigation.requestLibrary()
  let second = try #require(navigation.pending)
  #expect(first != second)
  #expect(navigation.consume(first) == nil)
  #expect(navigation.consume(second)?.path == ["home"])
  navigation.requestLibrary()
  #expect(navigation.pending != second && navigation.pending != nil)
}

@Test func changingFolderAccessWhileBackgroundedInvalidatesTheRefreshTask() {
  let eligible = SiriFolderAccess(entitled: true, active: false)
  #expect(eligible != SiriFolderAccess(entitled: false, active: false))
  #expect(eligible != SiriFolderAccess(entitled: true, active: true))
}

@Test func folderSuggestionsRefreshWhenTheCatalogIsFirstReadRenamedOrCleared() {
  var suggestions = SiriFolderSuggestions()
  let initial = suggestions.changed(to: [:])
  let added = suggestions.changed(to: ["a": "First", "b": "Second"])
  let reordered = suggestions.changed(to: ["b": "Second", "a": "First"])
  let renamed = suggestions.changed(to: ["a": "Renamed", "b": "Second"])
  let removed = suggestions.changed(to: [:])
  #expect(initial && added && !reordered && renamed && removed)
}
