import ShelvrKit
import SwiftUI

struct SharedListsView: View {
  @Environment(\.copy) private var copy

  var body: some View {
    SocialQuery(query: "sharedLists:listSharedLists", type: [SharedListSummary].self) { rows in
      List(rows) { row in
        if let link = AppLink("/shared-list/" + row.id) {
          NavigationLink(value: link) {
            VStack(alignment: .leading) {
              Text(row.name).font(.headline)
              Text(row.cities.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
            }
          }.badge(row.newCount)
        }
      }
      .overlay {
        if rows.isEmpty { ContentUnavailableView(copy("sharedLists.title"), systemImage: "person.2",
          description: Text(copy("sharedLists.hint"))) }
      }
    }
    .navigationTitle(copy("sharedLists.title"))
    .toolbar {
      if let route = AppLink("/new-shared-list") {
        NavigationLink(value: route) { Label(copy("sharedLists.newList"), systemImage: "plus") }
      }
    }
  }
}

struct JoinListView: View {
  let token: String
  let open: (String) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var busy = false
  @State private var failed = false
  @State private var expired = false

  var body: some View {
    SocialQuery(query: "sharedLists:invitePreview", arguments: ["token": token], type: ListInvite?.self) { invite in
      if let invite, !expired {
        List {
          Section {
            Text(invite.name).font(.title.bold())
            Text(invite.cities.joined(separator: " · "))
            ForEach(invite.placeNames.indices, id: \.self) { index in Text(invite.placeNames[index]) }
          } header: {
            Text(invite.inviterName.map { copy("sharedLists.joinTitle", ["name": $0]) } ?? copy("sharedLists.joinTitleNoName"))
          }
          Section {
            Button(copy("sharedLists.join")) {
              guard !busy else { return }
              busy = true
              Task {
                defer { busy = false }
                do {
                  if let id = try await backend.joinList(token: token) { open("/shared-list/" + id) }
                  else { expired = true }
                } catch { failed = true }
              }
            }.disabled(busy)
          } footer: { Text(copy("sharedLists.joinFree")) }
        }
      } else {
        ContentUnavailableView(copy("sharedLists.deadTitle"), systemImage: "link",
          description: Text(copy("sharedLists.deadBody")))
      }
    }
    .alert(copy("sharedLists.joinFailed"), isPresented: $failed) { Button(copy("common.close")) {} }
    .navigationTitle(copy("sharedLists.invite"))
  }
}

struct SharedListView: View {
  let id: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var failed = false
  @State private var writing: Set<String> = []
  @State private var add = false
  @State private var removal: Removal?
  @State private var operation = SocialOperation()
  @Environment(\.dismiss) private var dismiss

  private struct Removal {
    let title, message, confirm: String
    let apply: @MainActor () async throws -> Void
  }

  var body: some View {
    SocialQuery(query: "sharedLists:getSharedList", arguments: ["listId": id], type: SharedListDetail?.self) { detail in
      if let detail {
        List {
          Section {
            ShareLink(item: detail.inviteURL(preview: backend.environment.variant == .development)) {
              Label(copy("sharedLists.invite"), systemImage: "person.badge.plus")
            }
            ForEach(detail.members) { member in
              let name = member.isYou ? copy("sharedLists.you") : member.firstName ?? copy("sharedLists.someone")
              Text(name).swipeActions {
                if detail.isOwner && !member.isYou {
                  Button(copy("sharedLists.removeMember"), role: .destructive) {
                    removal = Removal(title: copy("sharedLists.removeMemberTitle", ["name": name]),
                      message: copy("sharedLists.removeMemberBody"), confirm: copy("sharedLists.removeMember")) {
                      try await backend.removeMember(member.id, from: id)
                    }
                  }
                }
              }
            }
          } footer: { Text(copy("sharedLists.inviteHint")) }
          Section(copy("sharedLists.onList")) {
            Button(copy("tripPlanner.addPlace")) { add = true }
            if detail.places.isEmpty { Text(copy("sharedLists.emptyBody")).foregroundStyle(.secondary) }
            ForEach(detail.places) { place in
              HStack {
                VStack(alignment: .leading) {
                  Text(place.name)
                  Text(place.city).font(.caption).foregroundStyle(.secondary)
                  if let line = place.visitors(copy: copy) { Text(line).font(.caption) }
                  if place.isNew {
                    Text(copy("sharedLists.newFrom", ["name": place.addedByName ?? copy("sharedLists.someone")])).font(.caption.bold())
                  }
                }
                Spacer()
                Button {
                  guard writing.insert(place.id).inserted else { return }
                  Task {
                    defer { writing.remove(place.id) }
                    do { try await backend.markListPlace(place.id, went: !place.went) }
                    catch { failed = true }
                  }
                } label: {
                  Image(systemName: place.went ? "checkmark.seal.fill" : "seal")
                    .frame(width: 44, height: 44)
                }.buttonStyle(.borderless).disabled(writing.contains(place.id))
                  .accessibilityLabel(copy("passport.stampPlaceLabel", ["name": place.name]))
                  .accessibilityAddTraits(place.went ? .isSelected : [])
              }
              .swipeActions {
                Button(copy("sharedLists.removeFromList"), role: .destructive) {
                  removal = Removal(title: place.name, message: copy("sharedLists.removeFromList"),
                    confirm: copy("sharedLists.removeFromList")) { try await backend.removeListPlace(place.id) }
                }
              }
            }
          }
          Button(copy("sharedLists.leave"), role: .destructive) {
            removal = Removal(title: copy("sharedLists.leaveTitle", ["name": detail.name]),
              message: copy("sharedLists.leaveBody"), confirm: copy("sharedLists.leave")) {
              try await backend.leaveList(id)
              dismiss()
            }
          }
        }
        .sheet(isPresented: $add) { AddListPlaceView(detail: detail) }
        .navigationTitle(detail.name)
        .onDisappear {
          guard detail.places.contains(where: \.isNew), backend.status == .signedIn else { return }
          Task { try? await backend.listSeen(detail._id) }
        }
      } else {
        ContentUnavailableView(copy("sharedLists.goneTitle"), systemImage: "person.2",
          description: Text(copy("sharedLists.goneBody")))
      }
    }
    .confirmationDialog(removal?.title ?? "", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }),
      titleVisibility: .visible, presenting: removal) { action in
      Button(action.confirm, role: .destructive) { operation.run(action.apply) }
      Button(copy("common.cancel"), role: .cancel) {}
    } message: { Text($0.message) }
    .socialOperation(operation, failure: copy("sharedLists.failed"), close: copy("common.close"))
    .alert(copy("sharedLists.failed"), isPresented: $failed) { Button(copy("common.close")) {} }
  }
}
