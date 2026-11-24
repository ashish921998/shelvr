import ShelvrInbox
import SwiftUI
import WidgetKit

private struct Entry: TimelineEntry {
  let date: Date
  let snapshot: RecentSavesSnapshot?
}

private struct RecentTimeline: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: .now, snapshot: nil) }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(current()) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let entry = current()
    var entries = [entry]
    if let expires = entry.snapshot?.expires { entries.append(Entry(date: expires, snapshot: nil)) }
    completion(Timeline(entries: entries, policy: .never))
  }

  private func current() -> Entry {
    let date = Date()
    guard let location = RecentSavesSnapshot.location,
      let bytes = try? Data(contentsOf: location),
      let snapshot = try? JSONDecoder().decode(RecentSavesSnapshot.self, from: bytes),
      snapshot.visible(to: ShareInbox.system()?.activeOwner, at: date)
    else { return Entry(date: date, snapshot: nil) }
    return Entry(date: date, snapshot: snapshot)
  }
}

private struct RecentSavesView: View {
  @Environment(\.widgetFamily) private var family
  let entry: Entry
  private let copy = Copy()

  var body: some View {
    Group {
      if let snapshot = entry.snapshot, !snapshot.items.isEmpty {
        let items = Array(snapshot.displayed(small: family == .systemSmall))
        if family == .systemSmall {
          Grid(horizontalSpacing: 5, verticalSpacing: 5) {
            ForEach(0..<2, id: \.self) { row in
              GridRow {
                ForEach(0..<2, id: \.self) { column in
                  let index = row * 2 + column
                  if items.indices.contains(index) { tile(items[index], featured: false) }
                  else { Color.clear }
                }
              }
            }
          }
        } else {
          HStack(spacing: 8) {
            tile(items[0], featured: true)
            VStack(alignment: .leading, spacing: 5) {
              ForEach(items.dropFirst()) { item in
                HStack(spacing: 6) {
                  artwork(item).frame(width: 26, height: 26).clipShape(.rect(cornerRadius: 5))
                  VStack(alignment: .leading, spacing: 1) {
                    Text(item.title).font(.caption2.bold()).lineLimit(1)
                    Text(item.subtitle ?? "").font(.system(size: 9)).lineLimit(1).foregroundStyle(.secondary)
                  }
                }
              }
            }.frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      } else {
        let locked = entry.snapshot == nil
        VStack(spacing: 5) {
          Image(systemName: locked ? "lock.fill" : "tray")
          Text(copy(locked ? "widget.proTitle" : "widget.emptyTitle")).font(.caption.bold())
          Text(copy(locked ? "widget.proBody" : "widget.emptyBody")).font(.caption2).foregroundStyle(.secondary)
        }.multilineTextAlignment(.center)
      }
    }
    .containerBackground(.background, for: .widget)
    .widgetURL(RecentSavesSnapshot.destination(scheme: Bundle.main.object(forInfoDictionaryKey: "ShelvrScheme") as? String ?? "shelvr", snapshot: entry.snapshot))
  }

  private func tile(_ item: RecentSavesSnapshot.Item, featured: Bool) -> some View {
    GeometryReader { geometry in
      ZStack(alignment: .bottomLeading) {
        artwork(item).frame(width: geometry.size.width, height: geometry.size.height).clipped()
        if featured || item.thumbnail == nil {
          VStack(alignment: .leading, spacing: 1) {
            Text(item.title).lineLimit(2).font(.caption2.bold())
            if featured, let subtitle = item.subtitle { Text(subtitle).lineLimit(1).font(.system(size: 9)) }
          }.padding(5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial)
        }
      }.clipShape(.rect(cornerRadius: 8))
    }
  }

  @ViewBuilder private func artwork(_ item: RecentSavesSnapshot.Item) -> some View {
    if let bytes = item.thumbnail, let image = UIImage(data: bytes) {
      Image(uiImage: image).resizable().scaledToFill()
    } else {
      ZStack {
        Color.secondary.opacity(0.12)
        Image(systemName: item.kind == "image" ? "photo" : item.kind == "link" ? "link" : "note.text").foregroundStyle(.orange)
      }
    }
  }
}

@main
struct RecentSaves: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "RecentSaves", provider: RecentTimeline()) { RecentSavesView(entry: $0) }
      .configurationDisplayName(Text(Copy()("widget.title")))
      .description(Text(Copy()("widget.description")))
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}
