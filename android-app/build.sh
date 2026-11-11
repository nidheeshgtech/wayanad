#!/bin/sh
# Build and sign the Drive Wayanad Android app: dist/drive-wayanad.aab (Play upload) and dist/drive-wayanad.apk (sideload test).
set -e
cd "$(dirname "$0")"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
BT="$ANDROID_HOME/build-tools/35.0.0"
K="$HOME/Documents/DriveWayanad-keys"
P=$(grep "Keystore password" "$K/KEY-INFO.txt" | sed 's/.*: //')
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew --no-daemon -q bundleRelease assembleRelease
mkdir -p dist
cp app/build/outputs/bundle/release/app-release.aab dist/drive-wayanad.aab
"$JAVA_HOME/bin/jarsigner" -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$K/upload.keystore" -storepass "$P" dist/drive-wayanad.aab upload >/dev/null
"$BT/zipalign" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk dist/aligned.apk
PATH="$JAVA_HOME/bin:$PATH" "$BT/apksigner" sign --ks "$K/upload.keystore" --ks-key-alias upload --ks-pass pass:"$P" --out dist/drive-wayanad.apk dist/aligned.apk
rm -f dist/aligned.apk dist/*.idsig
PATH="$JAVA_HOME/bin:$PATH" "$BT/apksigner" verify dist/drive-wayanad.apk
ls -la dist
