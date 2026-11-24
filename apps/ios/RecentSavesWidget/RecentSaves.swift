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

  private func open(_ path: String) -> URL? {
    guard let scheme = Bundle.main.object(forInfoDictionaryKey: "ShelvrScheme") as? String else { return nil }
    return URL(string: "\(scheme)://\(path)")
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(copy("widget.title")).font(.caption.bold()).foregroundStyle(.secondary)
      if let snapshot = entry.snapshot {
        if snapshot.items.isEmpty {
          Text(copy("widget.emptyTitle")).font(.headline)
          Text(copy("widget.emptyBody")).font(.caption)
        } else {
          ForEach(snapshot.items.prefix(family == .systemSmall ? 2 : 4)) { item in
            if let url = open("item/\(item.id)") {
              Link(destination: url) {
                Label(item.title, systemImage: item.kind == "image" ? "photo" : item.kind == "link" ? "link" : "note.text")
                  .lineLimit(1).font(.subheadline)
              }
            }
          }
        }
      } else {
        Label(copy("widget.proTitle"), systemImage: "lock").font(.headline)
        Text(copy("widget.proBody")).font(.caption)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .containerBackground(.background, for: .widget)
    .widgetURL(open(entry.snapshot?.items.first.map { "item/\($0.id)" } ?? "home"))
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
