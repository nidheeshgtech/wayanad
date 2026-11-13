import GameKit
import UIKit

/// Game Center: signs the player in quietly at launch (the system shows its own banner or sign-in sheet), then takes
/// scores and achievements from the game (lib/native.ts). Ids match the ones set up in App Store Connect:
/// leaderboards "drivewayanad.fastest" (elapsed time in hundredths of a second) and "drivewayanad.points",
/// achievements "drivewayanad.badge.<id>". If the player isn't signed in, everything here quietly does nothing.
final class GameCenter {
    static let shared = GameCenter()
    private var reported = Set<String>()
    private var pending = Set<String>()   // earned before sign-in finished; reported once it does

    var isOn: Bool { GKLocalPlayer.local.isAuthenticated }

    func signIn(presentingFrom root: UIViewController?) {
        GKLocalPlayer.local.authenticateHandler = { [weak self, weak root] sheet, error in
            if let sheet, let root { root.present(sheet, animated: true) }
            if let error { print("Game Center:", error.localizedDescription) }
            if GKLocalPlayer.local.isAuthenticated, let self, !self.pending.isEmpty {
                let ids = Array(self.pending); self.pending.removeAll(); self.complete(achievements: ids)
            }
        }
    }

    func submit(score: Int, to board: String) {
        guard isOn else { return }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [board]) { error in
            if let error { print("Game Center score:", error.localizedDescription) }
        }
    }

    /// Badges are earned once; ones already reported this launch are skipped.
    func complete(achievements ids: [String]) {
        let fresh = ids.filter { !reported.contains($0) }
        guard !fresh.isEmpty else { return }
        guard isOn else { pending.formUnion(fresh); return }
        let list = fresh.map { id -> GKAchievement in
            let a = GKAchievement(identifier: id)
            a.percentComplete = 100
            a.showsCompletionBanner = true
            return a
        }
        GKAchievement.report(list) { [weak self] error in
            if let error { print("Game Center achievements:", error.localizedDescription); return }
            DispatchQueue.main.async { fresh.forEach { self?.reported.insert($0) } }
        }
    }
}
