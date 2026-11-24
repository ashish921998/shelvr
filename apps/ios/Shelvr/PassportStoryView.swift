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

  private struct Output: Identifiable { let id = UUID(); let items: [Any] }

  var body: some View {
    ScrollView {
      if let stamps, let cities, let together {
        let story = PassportStory(places: stamps, cities: cities) { copy($0.labelKey) }
        VStack(spacing: 16) {
          card(story, together: together, images: [], code: nil)
          Button(copy("common.share")) { export(story, together: together, asLink: false) }
            .buttonStyle(.borderedProminent)
          Button(copy("passportStory.shareLink")) { export(story, together: together, asLink: true) }
          Text(copy("passportStory.linkNote")).font(.footnote).foregroundStyle(.secondary)
        }.disabled(busy).padding()
      } else if failed.isEmpty { ProgressView() }
      if !failed.isEmpty { Button(copy("common.retry")) { retry += 1 } }
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
    guard !busy else { return }
    busy = true
    Task {
      defer { busy = false }
      do {
        let url = try await backend.sharePassport()
        if asLink { share = Output(items: [url]); return }
        var images: [UIImage] = []
        for stamp in story.photos {
          guard let link = stamp.cover.flatMap(URL.init(string:)), link.scheme == "https",
            let (data, _) = try? await URLSession.shared.data(from: link),
            let image = UIImage(data: data)?.preparingThumbnail(of: CGSize(width: 300, height: 300))
          else { continue }
          images.append(image)
        }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        filter.correctionLevel = "M"
        guard let qr = filter.outputImage,
          let cg = CIContext().createCGImage(qr, from: qr.extent) else { shareFailed = true; return }
        let renderer = ImageRenderer(content: card(story, together: together, images: images, code: UIImage(cgImage: cg)).frame(width: 360))
        renderer.scale = 3
        guard let image = renderer.uiImage else { shareFailed = true; return }
        share = Output(items: [image])
      } catch { shareFailed = true }
    }
  }

  private func card(_ story: PassportStory, together: Int, images: [UIImage], code: UIImage?) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(copy("passportStory.kicker", ["year": String(Calendar.current.component(.year, from: Date()))])).font(.caption.bold())
      Text(story.places.formatted()).font(.system(size: 60, weight: .black, design: .rounded))
      Text(copy("passport.heroStamped")).font(.headline)
      HStack {
        Text("\(story.cities) \(copy("passport.cities"))")
        if story.countries > 0 { Text("\(story.countries) \(copy("passport.countries"))") }
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
      Divider()
      HStack {
        Text(copy("passportStory.tagline")).font(.title2.bold())
        Spacer()
        if let code {
          Image(uiImage: code).resizable().interpolation(.none).frame(width: 65, height: 65)
            .padding(8).background(.white).accessibilityLabel(copy("passportStory.scan"))
        }
      }
      Text("Shelvr").font(.headline)
    }
    .frame(maxWidth: .infinity, alignment: .leading).padding(24)
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
