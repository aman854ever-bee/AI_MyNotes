# Building the MyNotes Android APK

The native Android project (`apps/web/android/`) is already generated and
committed — see ADR `0009-android-packaging.md`. Building it needs the
Android SDK and Gradle to download from Google's servers, which the
Claude session itself can't reach (its network egress is allow-listed to
npm/GitHub only, confirmed by testing — `dl.google.com` comes back
403'd). Two ways around that, below: let GitHub's own servers do the
build, or do it on your own PC.

## Option A — CI build, no local install needed (fastest for just testing)

`.github/workflows/build-android-apk.yml` builds a debug APK on GitHub's
runners (which have normal internet access) and hands it back as a
downloadable file — no Android Studio, no SDK setup on your machine.

1. Push the branch that has this workflow file, if you haven't yet.
2. On GitHub: **Actions** tab → **Build Android APK** (left sidebar) →
   **Run workflow** → pick the branch → **Run workflow**.
3. Wait for the run to go green (a few minutes — first run is slower
   while it caches the Android SDK/Gradle).
4. Open the finished run, scroll to **Artifacts**, download
   `mynotes-debug-apk` (a `.zip` containing `app-debug.apk`).
5. Copy `app-debug.apk` onto your phone (email it to yourself, or a USB
   file transfer) and tap it in a file manager — Android will ask to
   allow installing from that source once.

This is a debug build, signed with the shared Android debug key — fine
to install on your own device, not for distributing to anyone else's.
Same backend-configuration caveat as Option B below.

## Option B — Your own PC (needed for a real signed release build later)

### One-time setup

1. **Install Android Studio**: https://developer.android.com/studio
   (Windows installer, default options are fine). This also installs the
   Android SDK and a Gradle-compatible JDK — you don't need to install
   those separately.
2. Open Android Studio once so it finishes its first-run SDK setup.

### Every time you want a fresh APK

From a normal terminal (PowerShell/CMD, not the Claude session):

```
cd "D:\AI - Projects\My Notes\apps\web"
npm install          (only needed the first time, or after a package.json change)
npm run build         builds the latest web app into dist/
npx cap sync android   copies dist/ into the native project
```

Then either:

**A. Android Studio (easiest, handles signing/SDK versions for you)**
1. `File > Open` → select `apps/web/android`.
2. Let it finish Gradle sync (first time only, a few minutes).
3. `Build > Build App Bundle(s) / APK(s) > Build APK(s)`.
4. When it finishes, click the "locate" link in the notification, or find
   it at `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`.

**B. Command line, once Android Studio has installed the SDK once**
```
cd "D:\AI - Projects\My Notes\apps\web\android"
.\gradlew.bat assembleDebug
```
Output lands at the same `app-debug.apk` path above.

## Installing it on your phone

- Easiest: plug the phone in via USB with "USB debugging" enabled
  (Settings → About phone → tap Build number 7 times → Developer options
  → USB debugging), then in Android Studio's toolbar pick your device and
  press ▶ Run — it installs and launches in one step.
- Or just copy `app-debug.apk` to the phone (email it to yourself, or via
  USB file transfer) and tap it in a file manager — Android will ask to
  allow installing from that source once.

## What to expect from this build

This is a **debug build with no backend configured yet** unless you've
already filled in `apps/web/.env` — see the provisioning checklist in the
project status doc for Supabase/Deepgram/Anthropic setup. Recording and
local note-taking work with zero setup; transcription and AI analysis
need that checklist done first. It's also **unsigned** — fine for
installing on your own device, not suitable for distributing to anyone
else's without a proper release signing key later.

## The simpler alternative: skip the APK entirely

MyNotes is a PWA, and it's already live at
https://aman854ever-bee.github.io/AI_MyNotes/ — open that in Chrome on
your phone and use the menu's "Add to Home screen" / "Install app" to
get an app icon with no build step at all. Same backend-configuration
caveat as above. Worth doing first if a real APK isn't actually the goal
— an installed PWA looks and behaves like an app.
