import UIKit

/// Drive Wayanad for iPhone: one full-screen web view on the game (GameViewController), plus what the App Store
/// expects of an app rather than a website — Game Center, haptics, the share sheet and an offline screen.
/// Scene-based (iOS 27 requires it): the window is made in SceneDelegate.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool { true }

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Game", sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = .wayanadBackground
        window.rootViewController = GameViewController()
        window.makeKeyAndVisible()
        self.window = window
        GameCenter.shared.signIn(presentingFrom: window.rootViewController)
    }
}

extension UIColor {
    /// The site's background, #0E1F1A, and its one accent, amber #D9A441.
    static let wayanadBackground = UIColor(red: 0x0E / 255, green: 0x1F / 255, blue: 0x1A / 255, alpha: 1)
    static let wayanadAmber = UIColor(red: 0xD9 / 255, green: 0xA4 / 255, blue: 0x41 / 255, alpha: 1)
    static let wayanadInk = UIColor(red: 0xEE / 255, green: 0xF2 / 255, blue: 0xEE / 255, alpha: 1)
    static let wayanadMute = UIColor(red: 0xB8 / 255, green: 0xC7 / 255, blue: 0xC0 / 255, alpha: 1)
}
