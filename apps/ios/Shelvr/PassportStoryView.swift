import CoreImage.CIFilterBuiltins
import ShelvrKit
import SwiftUI

struct PassportStoryView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var stamps: [PassportStamp]?
  @State private var cities: [PassportCityStamp]?
  @State private var together: Int?
  @State private var failed = Set<String>()
  @State private var retry = 0
  @State private var busy = false
  @State private var shareFailed = false
  @State private var share: Output?
  @State private var photos: [UIImage] = []
  @State private var loadedPhotos: [String]?

  private struct Output: Identifiable { let id = UUID(); let items: [Any] }

  var body: some View {
    GeometryReader { geometry in
      ScrollView {
      if let stamps {
        let cityReady = cities != nil || failed.contains("cityStamps:listCityStamps")
        let togetherReady = together != nil || failed.contains("placeVisits:passportTogether")
        let totalTogether = min(together ?? 0, stamps.count)
        let story = PassportStory(places: stamps, cities: cities ?? []) { copy($0.labelKey) }
        VStack(spacing: 16) {
          let width = min(360, max(1, geometry.size.width - 32))
          card(story, together: totalTogether, images: photos, code: nil)
            .scaleEffect(width / 360, anchor: .topLeading)
            .frame(width: width, height: width * 16 / 9, alignment: .topLeading)
          Button(copy("common.share")) { export(story, together: totalTogether, asLink: false) }
            .buttonStyle(.borderedProminent)
            .disabled(story.places == 0 || !cityReady || !togetherReady || loadedPhotos != story.photos.compactMap(\.cover))
          Button(copy("passportStory.shareLink")) { export(story, together: totalTogether, asLink: true) }
          Text(copy("passportStory.linkNotePassportMenu")).font(.footnote).foregroundStyle(.secondary)
        }.disabled(busy).padding()
          .task(id: story.photos.compactMap(\.cover)) {
            let links = story.photos.compactMap(\.cover)
            photos = []
            loadedPhotos = nil
            let next = await thumbnails(links)
            guard !Task.isCancelled else { return }
            photos = next
            loadedPhotos = links
          }
      } else if failed.isEmpty { ProgressView() }
      if !failed.isEmpty { Button(copy("common.retry")) { retry += 1 } }
      }.frame(maxWidth: .infinity)
    }
    .navigationTitle(copy("passportStory.screenTitle"))
    .sheet(item: $share) { output in PassportActivity(items: output.items) }
    .alert(copy("errors.tryAgain"), isPresented: $shareFailed) { Button(copy("common.close")) {} }
    .task(id: retry) { await watch("placeVisits:listPassportStamps", [PassportStamp].self) { stamps = $0 } }
    .task(id: retry) { await watch("cityStamps:listCityStamps", [PassportCityStamp].self) { cities = $0 } }
    .task(id: retry) { await watch("placeVisits:passportTogether", Int.self) { together = $0 } }
  }

  private func watch<T: Decodable>(_ name: String, _ type: T.Type, set: (T) -> Void) async {
    failed.remove(name)
    do {
      for try await value in backend.query(name, as: type) {
        try Task.checkCancellation()
        set(value)
      }
    } catch { if !Task.isCancelled { failed.insert(name) } }
  }

  private func export(_ story: PassportStory, together: Int, asLink: Bool) {
    guard !busy, asLink || story.places > 0 else { return }
    let selectedPhotos = photos
    busy = true
    Task {
      defer { busy = false }
      do {
        let url = try await backend.sharePassport()
        if asLink { share = Output(items: [url]); return }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        filter.correctionLevel = "M"
        guard let qr = filter.outputImage,
          let cg = CIContext().createCGImage(qr, from: qr.extent) else { shareFailed = true; return }
        let renderer = ImageRenderer(content: card(story, together: together, images: selectedPhotos, code: UIImage(cgImage: cg)))
        renderer.scale = 3
        guard let image = renderer.uiImage else { shareFailed = true; return }
        share = Output(items: [image])
      } catch { shareFailed = true }
    }
  }

  private func thumbnails(_ links: [String]) async -> [UIImage] {
    var images = [UIImage]()
    for raw in links {
      guard !Task.isCancelled, let link = URL(string: raw), link.scheme == "https",
        let (data, _) = try? await URLSession.shared.data(from: link),
        let small = UIImage(data: data)?.preparingThumbnail(of: CGSize(width: 300, height: 300))
      else { continue }
      images.append(small)
    }
    return images
  }

  private func card(_ story: PassportStory, together: Int, images: [UIImage], code: UIImage?) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(copy("passportStory.kicker", ["year": String(Calendar.current.component(.year, from: Date()))])).font(.caption.bold())
      Text(story.places.formatted()).font(.system(size: 60, weight: .black, design: .rounded))
      Text(copy(story.fromReels ? "passportStory.titleReels" : "passportStory.titleSaved", count: story.places))
        .font(.title2.bold())
      HStack {
        Text(copy("passport.citiesCount", count: story.cities))
        if story.countries > 0 { Text(copy("passport.countriesCount", count: story.countries)) }
      }.font(.subheadline)
      if !story.cityNames.isEmpty { Text(story.cityNames.joined(separator: " · ")).font(.title3.bold()) }
      if !images.isEmpty {
        HStack {
          ForEach(images.indices, id: \.self) { i in
            Image(uiImage: images[i]).resizable().scaledToFill().frame(width: 60, height: 60).clipShape(Circle())
          }
        }
      } else if !story.photos.isEmpty {
        Text(story.photos.map(\.name).joined(separator: " · ")).font(.caption)
      }
      if together > 0 { Label(String(together), systemImage: "person.2.fill") }
      Spacer()
      Divider()
      HStack {
        Text(copy("passportStory.tagline")).font(.title2.bold())
        Spacer()
        if let code {
          Image(uiImage: code).resizable().interpolation(.none).frame(width: 65, height: 65)
            .padding(8).background(.white).accessibilityLabel(copy("passportStory.scan"))
        } else {
          Image(systemName: "qrcode").font(.system(size: 54)).frame(width: 81, height: 81)
            .accessibilityLabel(copy("passportStory.scan"))
        }
      }
      Text("Shelvr").font(.headline)
    }
    .padding(24).frame(width: 360, height: 640, alignment: .topLeading)
    .foregroundStyle(.black).background(Color(red: 1, green: 0.95, blue: 0.82), in: RoundedRectangle(cornerRadius: 20))
  }
}

private struct PassportActivity: UIViewControllerRepresentable {
  let items: [Any]
  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: items, applicationActivities: nil)
  }
  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
