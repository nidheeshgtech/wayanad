import UIKit
import WebKit
import SafariServices
import Network

/// The game, full screen: drivewayanad.com in a web view (WebKit, as the App Store requires), edge to edge with the
/// status bar and home indicator out of the way. Around it:
///  - a launch cover (the logo on the site's green) until the page first paints; the game shows its own loading bar
///  - the bridge "wayanad" for lib/native.ts: haptics, Game Center scores and achievements, the share sheet
///  - an offline screen with Try again (and an automatic retry when the connection comes back)
///  - links that leave the game (privacy page, Instagram, mail, WhatsApp) open in Safari or their own app
///  - the microphone for voice chat (iOS asks once, with NSMicrophoneUsageDescription)
///  - a reload if iOS stops the page for memory while the app is in the background
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    static let home = URL(string: "https://www.drivewayanad.com/")!
    private static let hosts: Set<String> = ["drivewayanad.com", "www.drivewayanad.com"]

    private var web: WKWebView!
    private let cover = LaunchCover()
    private let offline = OfflineView()
    private let monitor = NWPathMonitor()
    private var showingOffline = false

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .allButUpsideDown }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // keep Safari's "Mobile/…" token (the site reads it) and add who we are, for the visitor counts
        config.applicationNameForUserAgent = "Mobile/15E148 DriveWayanadApp/1.0"
        config.userContentController.add(WeakHandler(self), name: "wayanad")

        web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .wayanadBackground
        web.scrollView.backgroundColor = .wayanadBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.bounces = false
        web.allowsBackForwardNavigationGestures = false
        web.allowsLinkPreview = false
        web.navigationDelegate = self
        web.uiDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true } // Safari → Develop → Simulator
        #endif

        let root = UIView()
        root.backgroundColor = .wayanadBackground
        for v in [web!, offline, cover] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            root.addSubview(v)
            NSLayoutConstraint.activate([
                v.leadingAnchor.constraint(equalTo: root.leadingAnchor), v.trailingAnchor.constraint(equalTo: root.trailingAnchor),
                v.topAnchor.constraint(equalTo: root.topAnchor), v.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            ])
        }
        offline.isHidden = true
        offline.onRetry = { [weak self] in self?.retry() }
        view = root
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: Self.home))
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            DispatchQueue.main.async { if self?.showingOffline == true { self?.retry() } }
        }
        monitor.start(queue: DispatchQueue(label: "net"))
    }

    // MARK: loading, offline

    private func retry() {
        showOffline(false)
        if web.url == nil { web.load(URLRequest(url: Self.home)) } else { web.reload() }
    }

    private func showOffline(_ on: Bool) {
        showingOffline = on
        offline.isHidden = !on
        if on { hideCover() }
    }

    private func hideCover() {
        guard cover.alpha > 0 else { return }
        UIView.animate(withDuration: 0.35, animations: { self.cover.alpha = 0 }) { _ in self.cover.isHidden = true }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { hideCover() }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    private func failed(_ error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        showOffline(true)
    }

    /// iOS stopped the page (memory, usually while in the background): load it again rather than show a blank screen.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // MARK: links

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let scheme = url.scheme?.lowercased() ?? ""
        if ["about", "data", "blob"].contains(scheme) { return decisionHandler(.allow) }
        if (scheme == "https" || scheme == "http"), let host = url.host?.lowercased(), Self.hosts.contains(host) {
            // our own pages stay in the game, except the privacy page, which opens over it
            if action.targetFrame?.isMainFrame == true, url.path.hasPrefix("/privacy") { openOutside(url); return decisionHandler(.cancel) }
            return decisionHandler(.allow)
        }
        if action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) } // (frames inside the page)
        openOutside(url)
        decisionHandler(.cancel)
    }

    /// target="_blank" links: never a second web view; open them outside.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { openOutside(url) }
        return nil
    }

    private func openOutside(_ url: URL) {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "http" || scheme == "https" {
            let safari = SFSafariViewController(url: url)
            safari.preferredBarTintColor = .wayanadBackground
            safari.preferredControlTintColor = .wayanadAmber
            present(safari, animated: true)
        } else {
            UIApplication.shared.open(url) // mailto:, whatsapp:, instagram:, tel:
        }
    }

    // MARK: microphone (voice chat), dialogs

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(Self.hosts.contains(origin.host.lowercased()) && type == .microphone ? .grant : .deny)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    // MARK: the bridge (lib/native.ts)

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard Self.hosts.contains(message.frameInfo.securityOrigin.host.lowercased()),
              let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            hideCover()
            if let ids = body["achievements"] as? [String] { GameCenter.shared.complete(achievements: ids) }
        case "haptic":
            Haptics.play(body["style"] as? String ?? "light")
        case "score":
            if let board = body["board"] as? String, let value = (body["value"] as? NSNumber)?.intValue {
                GameCenter.shared.submit(score: value, to: board)
            }
        case "achievement":
            if let id = body["id"] as? String { GameCenter.shared.complete(achievements: [id]) }
        case "share":
            share(text: body["text"] as? String ?? "", url: body["url"] as? String ?? "", image: body["image"] as? String)
        default:
            break
        }
    }

    private func share(text: String, url: String, image: String?) {
        var items: [Any] = ["\(text) \(url)".trimmingCharacters(in: .whitespaces)]
        if let image, let comma = image.firstIndex(of: ","),
           let data = Data(base64Encoded: String(image[image.index(after: comma)...])), let picture = UIImage(data: data) {
            items.insert(picture, at: 0)
        }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        present(sheet, animated: true)
    }
}

/// A buzz for each kind the game asks for.
enum Haptics {
    static func play(_ style: String) {
        switch style {
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}

/// WKUserContentController holds its handlers strongly; this breaks the cycle with the view controller.
final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { target?.userContentController(c, didReceive: m) }
}
