import ShelvrKit
import SwiftUI

struct LibraryItemContents: View {
  let save: LibrarySave
  @Environment(\.copy) private var copy

  var body: some View {
    if let recipe = save.recipe {
      if let name = recipe.name { Text(name).font(.headline) }
      if !recipe.ingredients.isEmpty {
        Text(copy("recipe.ingredients")).font(.headline)
        ForEach(Array(recipe.ingredients.enumerated()), id: \.offset) { _, ingredient in Text(ingredient) }
      }
      if !recipe.steps.isEmpty {
        Text(copy("recipe.steps")).font(.headline)
        ForEach(Array(recipe.steps.enumerated()), id: \.offset) { index, step in
          VStack(alignment: .leading) {
            Text(copy("recipe.stepNumber", ["number": (index + 1).formatted()])).font(.caption.bold())
            Text(step)
          }
        }
      }
    }
    ForEach(Array(((save.media ?? []) + (save.articleMedia ?? [])).enumerated()), id: \.offset) { _, media in
      if media.imageUrl != (save.imageUrl ?? save.heroImageUrl), let url = URL(string: media.imageUrl) {
        AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { Color.clear }
      }
    }
    if let products = save.products, !products.isEmpty {
      Text(copy("products.shop")).font(.headline)
      ForEach(Array(products.enumerated()), id: \.offset) { _, product in
        if let url = URL(string: product.url), ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
          Link([product.title, product.price].compactMap { $0 }.joined(separator: " · "), destination: url)
        }
      }
    }
  }
}
