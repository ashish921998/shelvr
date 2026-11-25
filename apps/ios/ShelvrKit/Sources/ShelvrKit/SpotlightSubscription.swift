import ConvexMobile

extension Backend {
  public func spotlightPage(after cursor: String?) -> some AsyncSequence<SearchableSavePage, any Error> {
    let pagination: [String: ConvexEncodable?] = ["numItems": 100.0, "cursor": cursor]
    return query("items:listItemsPage", with: ["paginationOpts": pagination], as: SearchableSavePage.self)
  }
}
