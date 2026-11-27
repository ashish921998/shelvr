import ShelvrKit
import SwiftUI

struct LibraryItemView: View {
  let id: String
  var from: String?
  @Environment(\.scenePhase) private var phase
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @AppStorage("swift.appearance") private var appearance = "system"
  @State private var expandedDetails = false
  @State private var confirmingDelete = false
  @State private var busy = false
  @State private var message = ""
  @State private var save: LibrarySave?
  @State private var loaded = false
  @State private var failed = false
  @State private var attempt = 0
  @State private var recorded = false
  @State private var retryGate = SocialOperation(placement: "item_detail")

  private var openable: Bool { save?.status == "ready" && phase == .active }

  var body: some View {
    Group {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if let save {
        let palette = HomeChromePalette(scheme, appearance: appearance)
        ScrollView {
          VStack(alignment: .leading, spacing: 20) {
            if let image = save.imageUrl ?? save.heroImageUrl, let url = URL(string: image) {
              SavePhotoPreview(url: url, title: save.name(copy: copy)).id(url)
            }
            VStack(alignment: .leading, spacing: 6) {
              Text(save.name(copy: copy))
                .font(.custom("Satoshi-Bold", size: 30, relativeTo: .title))
                .accessibilityAddTraits(.isHeader)
              if let raw = save.url, let url = URL(string: raw),
                ["http", "https"].contains(url.scheme?.lowercased() ?? ""), let host = url.host {
                Link(destination: url) {
                  Label(copy("item.openSite", ["site": save.siteName ?? host]), systemImage: "arrow.up.right.square")
                    .frame(minHeight: 44)
                }.foregroundStyle(palette.primaryText)
                  .environment(\.openURL, OpenURLAction { _ in
                    Analytics.itemAction(save, "open_source")
                    return .systemAction
                  })
              }
            }
            if save.status == "processing" { Label(copy("item.reading"), systemImage: "clock") }
            if save.status == "failed" { Text(copy("homePlaces.reviewFailed")) }
            if save.enrichment == "partial" { Text(copy("item.partial")).font(.callout) }
            if let note = save.note { Text(note).textSelection(.enabled) }
            places(in: save, palette: palette)
            LibraryItemContents(save: save)
            if save.description?.isEmpty == false || (save.note == nil && save.content?.isEmpty == false) {
              DisclosureGroup(isExpanded: $expandedDetails) {
                VStack(alignment: .leading, spacing: 12) {
                  if let description = save.description { Text(description) }
                  if save.note == nil, let text = save.content, text != save.description { Text(text) }
                }.textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
              } label: {
                Text(copy("item.details")).font(.custom("Satoshi-Bold", size: 17, relativeTo: .headline))
                  .frame(minHeight: 44)
              }
              .tint(palette.primaryText)
              .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: expandedDetails)
            }
            TimelineView(.periodic(from: .now, by: 30)) { time in
              if save.canRetry(at: time.date) {
                Button(copy("common.retry")) { retryGate.run { try await retry() } }
                  .disabled(busy || retryGate.busy)
              }
            }
            if !message.isEmpty { Text(message).foregroundStyle(.secondary) }
          }
          .font(.custom("Satoshi-Regular", size: 16, relativeTo: .body))
          .foregroundStyle(palette.foreground)
          .frame(maxWidth: .infinity, alignment: .leading).padding(20)
        }
        .background(palette.background.ignoresSafeArea())
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Menu {
              Button(copy("common.delete"), role: .destructive) { confirmingDelete = true }
                .disabled(busy)
            } label: { Label(copy("item.actions"), systemImage: "ellipsis") }
          }
        }
      } else if loaded { ContentUnavailableView(copy("common.unavailable"), systemImage: "bookmark.slash") }
      else { ProgressView() }
    }
    .socialOperation(retryGate, failure: copy("errors.retryTitle"), close: copy("common.close"))
    .confirmationDialog(copy("item.deleteTitle"), isPresented: $confirmingDelete, titleVisibility: .visible) {
      Button(copy("item.deleteEverywhere"), role: .destructive) { Task { await remove() } }
      Button(copy("common.cancel"), role: .cancel) {}
    } message: { Text(copy("item.deleteBody")) }
    .onAppear(perform: recordOpen)
    .onDisappear { recorded = false }
    .onChange(of: openable) { recordOpen() }
    .task(id: "\(id)-\(attempt)") {
      save = nil; loaded = false; failed = false; expandedDetails = false
      do {
        for try await save in backend.librarySave(id: id) {
          guard !Task.isCancelled else { return }
          self.save = save; loaded = true
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }

  @ViewBuilder
  private func places(in save: LibrarySave, palette: HomeChromePalette) -> some View {
    let pins = save.placePins ?? []
    if !pins.isEmpty || save.status == "ready" {
      VStack(alignment: .leading, spacing: 0) {
        if !pins.isEmpty {
          Text(copy("passport.places"))
            .font(.custom("Satoshi-Bold", size: 20, relativeTo: .title3))
            .accessibilityAddTraits(.isHeader)
          ForEach(Array(pins.enumerated()), id: \.offset) { _, pin in
            HStack(spacing: 12) {
              Image(systemName: "mappin").foregroundStyle(palette.primaryText)
                .frame(width: 32, height: 32).background(palette.background, in: Circle())
                .accessibilityHidden(true)
              VStack(alignment: .leading, spacing: 2) {
                Text(pin.name).font(.custom("Satoshi-Bold", size: 16, relativeTo: .body))
                if let city = pin.city { Text(city).font(.subheadline).foregroundStyle(palette.muted) }
              }
            }.padding(.vertical, 8).accessibilityElement(children: .combine)
          }
        }
        if save.status == "ready", let link = AppLink("/edit-save-places?itemId=" + id) {
          NavigationLink(value: link) {
            Label(copy("placeCorrection.title"), systemImage: "pencil").frame(minHeight: 44)
          }.foregroundStyle(palette.primaryText)
        }
      }
      .padding(.horizontal, 16).padding(.vertical, 10)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(palette.surface, in: RoundedRectangle(cornerRadius: 18))
      .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(palette.border, lineWidth: 0.5).allowsHitTesting(false) }
    }
  }

  private func retry() async throws {
    guard !busy, let owner = backend.userID else { return }
    let session = backend.sessionGeneration
    busy = true
    defer { busy = false }
    do {
      let scheduled = try await backend.retrySave(id)
      guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
      message = scheduled ? "" : copy("item.stillWorking")
    } catch {
      guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
      throw error
    }
  }

  private func recordOpen() {
    guard !recorded, openable, let save else { return }
    recorded = true
    Analytics.itemOpened(save, source: from)
  }

  private func remove() async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    let deleted = save
    let generation = backend.sessionGeneration
    do {
      try await backend.deleteSave(id)
      if let deleted, generation == backend.sessionGeneration { Analytics.itemDeleted(deleted, surface: "item_detail") }
      dismiss()
    }
    catch { message = copy("item.deleteFailed") }
  }
}
