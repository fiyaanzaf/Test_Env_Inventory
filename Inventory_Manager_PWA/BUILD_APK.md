# Store OS — PWA to Android APK Build Guide

## Architecture Overview

```
┌──────────────────────┐         WiFi (LAN)        ┌──────────────────────┐
│   Desktop PC         │◄──────────────────────────►│   Android Phone      │
│                      │                            │                      │
│  FastAPI Backend     │   http://192.168.x.x:8000  │  Store OS APK        │
│  (uvicorn :8000)     │◄──────────────────────────►│  (Capacitor WebView) │
│                      │                            │                      │
│  Desktop React App   │    QR Code contains:       │  On first launch:    │
│  (vite :5173)        │    http://192.168.x.x:8000 │  → Scan QR           │
│                      │                            │  → Save URL           │
│  [Mobile Connect]    │──── Shows QR ─────────────►│  → Connect!           │
└──────────────────────┘                            └──────────────────────┘
```

## Prerequisites

- Node.js 18+
- npm or yarn
- Java JDK 17+ (for local builds only — NOT needed for cloud builds)

---

## Development Workflow

```bash
# After making code changes:
npm run build           # Rebuild PWA
npx cap sync android    # Sync web assets into Android project
# Then push to trigger CI release build
```

---

## Cloud Build via GitHub Actions (RECOMMENDED)

The workflow at `.github/workflows/android-build.yml` handles everything:

1. Builds the PWA (`npm run build`)
2. Syncs web assets (`npx cap sync android`)
3. Decodes your release keystore from GitHub Secrets
4. Builds a **signed release APK** (`./gradlew assembleRelease`)
5. Uploads the APK artifact with version-tagged name

**Triggers:**
- Automatic: Push to `main` with changes in `Inventory_Manager_PWA/`
- Manual: GitHub Actions → "Build Android APK (Release)" → Run workflow

---

## Release Keystore Setup (One-Time)

### Why the Keystore is Critical

| Aspect | Detail |
|---|---|
| **What it does** | Cryptographically signs your APK — proves YOU built it |
| **Store requirement** | Google Play, Samsung Galaxy Store etc. require every update signed with the **same key** |
| **If lost** | ⚠️ **You can never push updates.** You'd need a new app listing with a new package name |
| **Security** | Never commit `.jks` to Git. Never share passwords in plaintext |

### Generate the Keystore

Run this **once** on your machine:

```bash
keytool -genkeypair -v \
  -keystore store-os-release.jks \
  -alias store-os-key \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=Store OS, OU=Dev, O=StoreOS, L=City, ST=State, C=PK"
```

> **Note:** If `keytool` is not found, install any Java JDK (e.g., `winget install EclipseAdoptium.Temurin.21.JDK`) — keytool comes with Java.

### Encode for GitHub

```powershell
# PowerShell (Windows)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("store-os-release.jks")) | Set-Content keystore-base64.txt
```

```bash
# Linux/macOS
base64 -w 0 store-os-release.jks > keystore-base64.txt
```

### Add GitHub Secrets

Go to: **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value |
|---|---|
| `KEYSTORE_BASE64` | Contents of `keystore-base64.txt` |
| `KEYSTORE_PASSWORD` | Your store password |
| `KEY_PASSWORD` | Your key password |

### Back Up Your Keystore (CRITICAL)

- ✅ Store `.jks` file in **2+ secure locations** (password manager vault, encrypted USB)
- ✅ Record passwords in a password manager (Bitwarden, 1Password, etc.)
- ❌ Never email or share via plain text
- ❌ Never commit to Git (`.gitignore` already blocks `*.jks`)

---

## Versioning

| Field | Value | How It Works |
|---|---|---|
| `versionCode` | Auto from CI | Set to `github.run_number` — auto-increments on every build |
| `versionName` | From `package.json` | Read from the `"version"` field (e.g., `"1.0.0"`) |

**Before releasing a new version:**
1. Update `version` in `package.json` (e.g., `"1.0.0"` → `"1.1.0"`)
2. Push to `main` — CI handles the rest

> Store uploads require `versionCode` to always increase. Since it's tied to `github.run_number`, this is guaranteed.

---

## Android Project Structure

The `android/` directory is committed to the repo (Capacitor production best practice):

```
android/
├── app/
│   ├── build.gradle              ← Signing config + versioning
│   ├── src/main/
│   │   ├── AndroidManifest.xml   ← Cleartext HTTP + camera permission
│   │   ├── res/xml/
│   │   │   ├── network_security_config.xml  ← HTTP allowed
│   │   │   └── file_paths.xml
│   │   └── assets/               ← Web assets (gitignored, synced by Capacitor)
│   └── release-keystore.jks      ← ONLY present in CI (gitignored)
└── ...
```

**DO NOT delete the `android/` directory.** It contains your production Android config.

---

## Cleartext HTTP (LAN Support)

Android 9+ blocks HTTP by default. Since the backend runs on `http://192.168.x.x:8000`:

- `AndroidManifest.xml` has `android:usesCleartextTraffic="true"`
- `network_security_config.xml` allows all cleartext traffic
- These are permanently committed — no CI patching needed

---

## Troubleshooting

### "Connection refused" in APK
- Check both devices are on the same WiFi
- Check Windows Firewall allows port 8000
- Run: `netsh advfirewall firewall add rule name="FastAPI" dir=in action=allow protocol=TCP localport=8000`

### "net::ERR_CLEARTEXT_NOT_PERMITTED"
- Should not happen anymore — cleartext is permanently enabled
- If it does, verify `AndroidManifest.xml` still has the cleartext attributes

### QR Scanner doesn't work
- Check camera permissions in Android Settings
- Use "Enter URL Manually" as fallback

### Backend not detected (Desktop QR dialog)
- Make sure backend is running: `uvicorn main:app --host 0.0.0.0 --port 8000`
- The `--host 0.0.0.0` is critical — binds to all network interfaces

### CI build fails with "keystore not found"
- Verify `KEYSTORE_BASE64` secret is set in GitHub
- Check the base64 encoding was done correctly (no extra newlines)

### CI build fails with "wrong key password"
- Verify `KEYSTORE_PASSWORD` and `KEY_PASSWORD` match what you used when generating the keystore
- The alias must be `store-os-key` (as configured in `build.gradle`)
