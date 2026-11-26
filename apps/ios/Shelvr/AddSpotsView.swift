import ShelvrKit
import SwiftUI

struct AddSpotsView: View {
  let open: (String) -> Void
  @Environment(\.copy) private var copy
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dynamicTypeSize) private var typeSize
  @AppStorage("swift.appearance") private var appearance = "system"

  var body: some View {
    let palette = HomeChromePalette(scheme, appearance: appearance)
    let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: typeSize.isAccessibilitySize ? 1 : 2)
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HomeActionCard(title: copy("addSheet.pasteLink"), detail: copy("addSheet.pasteLinkHint"),
          symbol: "link", palette: palette, emphasis: .primary) { open("/add") }

        LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
          tile("/add", "addSheet.googleMapsList", "map", palette: palette)
          tile("/photo", "item.photo", "photo", palette: palette)
          tile("/how-to-share", "addSheet.howToShare", "play.rectangle", palette: palette)
          if Locale.preferredLanguages.first?.hasPrefix("en") == true {
            tile("/save-with-siri", "addSheet.saveWithSiri", "mic", palette: palette)
          }
        }

        VStack(alignment: .leading, spacing: 8) {
          Text(copy("addSheet.organize")).font(.custom("Satoshi-Bold", size: 15, relativeTo: .subheadline))
            .foregroundStyle(palette.muted)
            .accessibilityAddTraits(.isHeader)
          let shape = RoundedRectangle(cornerRadius: 16)
          VStack(spacing: 0) {
            organizeRow("/new-shared-list", "sharedLists.newTitle", "person.2", palette: palette)
            Rectangle().fill(palette.border).frame(height: 1).padding(.horizontal, 16)
            organizeRow("/new-trip", "homePlaces.planTrip", "suitcase", palette: palette)
          }
          .background(palette.surface, in: shape)
          .overlay { shape.strokeBorder(palette.border) }
        }
      }
      .padding(.horizontal, 20)
      .padding(.top, 8)
      .padding(.bottom, 24)
    }
    .background(palette.background.ignoresSafeArea())
    .navigationTitle(copy("addSheet.title"))
  }

  private func tile(_ route: String, _ title: String, _ symbol: String, palette: HomeChromePalette) -> some View {
    let shape = RoundedRectangle(cornerRadius: 16)
    return Button { open(route) } label: {
      VStack(alignment: .leading, spacing: 8) {
        Image(systemName: symbol).font(.system(size: 21, weight: .medium))
          .foregroundStyle(palette.primaryText)
          .frame(height: 24)
          .accessibilityHidden(true)
        Text(copy(title)).font(.custom("Satoshi-Bold", size: 15, relativeTo: .subheadline))
          .foregroundStyle(palette.foreground)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
      .padding(12)
      .background(palette.surface, in: shape)
      .overlay { shape.strokeBorder(palette.border) }
      .contentShape(shape)
    }
    .buttonStyle(HomeChromePressStyle())
  }

  private func organizeRow(_ route: String, _ title: String, _ symbol: String, palette: HomeChromePalette) -> some View {
    Button { open(route) } label: {
      HStack(spacing: 12) {
        Image(systemName: symbol).font(.system(size: 17, weight: .medium))
          .foregroundStyle(palette.primaryText)
          .frame(width: 22)
          .accessibilityHidden(true)
        Text(copy(title)).font(.custom("Satoshi-Bold", size: 15, relativeTo: .subheadline))
          .foregroundStyle(palette.foreground)
          .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold))
          .foregroundStyle(palette.muted)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(HomeChromePressStyle())
  }
}
