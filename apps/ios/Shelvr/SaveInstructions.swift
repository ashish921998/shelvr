import ShelvrKit
import SwiftUI

struct SaveInstructions: View {
  @Environment(\.copy) private var copy
  let siri: Bool

  var body: some View {
    List {
      if siri {
        Section(copy("siri.lead")) {
          LabeledContent(copy("siri.saveLinkTitle"), value: "Save this link to Shelvr")
          LabeledContent(copy("siri.saveNoteTitle"), value: "Save a note in Shelvr")
        }
      } else {
        Section(copy("setup.tiktok")) { Text(copy("setup.tiktokBody")) }
        Section(copy("setup.instagram")) { Text(copy("setup.instagramBody")) }
        Text(copy("share.openToFinish"))
      }
    }
    .navigationTitle(copy(siri ? "addSheet.saveWithSiri" : "addSheet.howToShare"))
  }
}
