import ShelvrInbox
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private let copy = Copy()
  private let message = UILabel()
  private let save = UIButton(type: .system)
  private let cancel = UIButton(type: .system)
  private var providers: [NSItemProvider] {
    (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    message.numberOfLines = 0
    message.textAlignment = .center
    message.font = .preferredFont(forTextStyle: .headline)
    message.text = copy("share.openToFinish")
    save.setTitle(copy("common.save"), for: .normal)
    save.addTarget(self, action: #selector(submit), for: .touchUpInside)
    cancel.setTitle(copy("common.cancel"), for: .normal)
    cancel.addTarget(self, action: #selector(close), for: .touchUpInside)
    let stack = UIStackView(arrangedSubviews: [message, save, cancel])
    stack.axis = .vertical
    stack.spacing = 15
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor)
    ])
    if ShareInbox.system()?.activeOwner == nil {
      message.text = copy("share.openToSignIn")
      save.isHidden = true
    }
  }

  @objc private func close() {
    extensionContext?.completeRequest(returningItems: nil)
  }

  @objc private func submit() {
    guard save.isEnabled, let inbox = ShareInbox.system(), let owner = inbox.activeOwner else { return }
    save.isEnabled = false
    cancel.isEnabled = false
    message.text = copy("share.reading")
    Task {
      do {
        let stage = try inbox.stage(owner: owner)
        defer { try? FileManager.default.removeItem(at: stage) }
        var attachments: [ShareAttachment] = []
        for provider in providers {
          if let attachment = try await load(provider, into: stage) { attachments.append(attachment) }
        }
        let payloads = ShareAttachment.payloads(attachments)
        guard !payloads.isEmpty else { throw CocoaError(.fileReadUnsupportedScheme) }
        try inbox.publish(payloads, in: stage)
        close()
      } catch {
        message.text = copy("share.itemFailure")
        save.isEnabled = true
        cancel.isEnabled = true
      }
    }
  }

  private func load(_ provider: NSItemProvider, into stage: URL) async throws -> ShareAttachment? {
    let offers = [UTType.url, .image, .plainText].filter { provider.hasItemConformingToTypeIdentifier($0.identifier) }
    return try await ShareAttachment.firstAvailable(offers) { type in
      if type == .image {
        let name = UUID().uuidString
        let target = stage.appending(path: name)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
          _ = provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
            do {
              guard let url else { throw error ?? CocoaError(.fileReadCorruptFile) }
              try FileManager.default.copyItem(at: url, to: target)
              continuation.resume()
            } catch { continuation.resume(throwing: error) }
          }
        }
        return .payload(InboxPayload(kind: .image, value: name))
      }
      let attachment: ShareAttachment? = try await withCheckedThrowingContinuation { continuation in
        provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, error in
          if let error { continuation.resume(throwing: error); return }
          if let url = item as? URL {
            continuation.resume(returning: ShareAttachment.webLink(url.absoluteString))
          } else if let text = item as? String {
            continuation.resume(returning: type == .url ? ShareAttachment.webLink(text) : .caption(text))
          } else { continuation.resume(returning: nil) }
        }
      }
      return attachment
    }
  }
}
