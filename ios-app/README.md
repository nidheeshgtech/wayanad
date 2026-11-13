# Drive Wayanad for iPhone

A small native app around the game. The app shows https://www.drivewayanad.com in a full-screen WKWebView, so game updates reach the app the moment they go live. No App Store upload is needed for them.

On top of the website it adds what the App Store asks of an app:
- Game Center leaderboards and achievements
- haptics
- the share sheet
- an offline screen
- a launch screen

The game talks to the app through `lib/native.ts`, which sends messages to the "wayanad" handler. In a browser that code does nothing.

## Files
- `project.yml`: the project, for XcodeGen. Run `xcodegen` here to make `DriveWayanad.xcodeproj`. Don't edit the .xcodeproj, which isn't in git.
- `DriveWayanad/AppDelegate.swift`: starts the app and signs in to Game Center.
- `DriveWayanad/GameViewController.swift`: the web view, the bridge, links, the microphone and offline handling.
- `DriveWayanad/GameCenter.swift`: scores and achievements.
- `DriveWayanad/Screens.swift`: the launch cover and the offline screen.
- `DriveWayanad/Info.plist`: generated from project.yml. `PrivacyInfo.xcprivacy` is the privacy manifest. `.entitlements` turns on Game Center in Release.

## Build
```sh
brew install xcodegen          # once
cd ios-app && xcodegen && open DriveWayanad.xcodeproj
```
- **Simulator:** pick an iPhone and press Run.
- **Your own iPhone with a free Apple ID:** Signing & Capabilities → Team → your Apple ID, then Run, using the Debug build (no Game Center). The app works for 7 days.
- **App Store:**
  1. Set `DEVELOPMENT_TEAM` in project.yml.
  2. Run `xcodegen`, then Product → Archive (Release, with Game Center).
  3. Distribute → App Store Connect.

## Game Center ids (create them in App Store Connect → the app → Game Center)
| Kind | Id | Notes |
|---|---|---|
| Leaderboard | `drivewayanad.fastest` | "Fastest climb", elapsed time in hundredths of a second, low to high |
| Leaderboard | `drivewayanad.points` | "Best score", integer, high to low |
| Achievements | `drivewayanad.badge.<id>` | One per badge in lib/badges.ts: finish, clean, hairpins, fast, coins, monkey, chaya, rain, night, friend |
