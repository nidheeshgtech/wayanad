# Drive Wayanad — Android app (TWA)

A Trusted Web Activity: a ~1 MB Android shell that opens https://www.drivewayanad.com full screen in Chrome.
Generated with @bubblewrap/core 1.27 from the live web manifest; the game itself updates with every web push.

- Package: `com.drivewayanad.app` (permanent once on Play)
- Upload key: `~/Documents/DriveWayanad-keys/upload.keystore` (alias `upload`, passwords in `KEY-INFO.txt` there). Never commit it.
- Site side: `explore-wayanad/public/.well-known/assetlinks.json` must list the upload key's SHA-256 **and**, after the
  first Play upload, the Play App Signing key's SHA-256 (Play Console → Test and release → App integrity).

## Build (Java 17 + Android SDK via Homebrew)

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew bundleRelease assembleRelease
```

Then sign: `jarsigner` for `app-release.aab`, `zipalign` + `apksigner` for the APK (see git history for the exact commands).
Bump `versionCode` / `versionName` in `app/build.gradle` (and `twa-manifest.json`) for each new store upload —
only needed when the shell changes (icon, name, colours), not for game updates.
