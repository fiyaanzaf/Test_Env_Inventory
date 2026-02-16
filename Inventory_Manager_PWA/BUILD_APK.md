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
- Java JDK 17 (for local builds only — NOT needed for cloud builds)

## Step 1: Install Dependencies

```bash
cd Inventory_Manager_PWA

# Install Capacitor core + CLI + Android platform
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

# Install QR code library for Desktop app
cd ../Inventory_Manager_Desktop
npm install qrcode
npm install -D @types/qrcode
```

## Step 2: Build the PWA

```bash
cd Inventory_Manager_PWA

# Build production bundle
npm run build
```

This creates the `dist/` folder that Capacitor will bundle into the APK.

## Step 3: Add Android Platform

```bash
# Initialize Capacitor (already done via capacitor.config.ts)
npx cap add android
```

This generates the `android/` folder with a full Android project.

## Step 4: Enable Cleartext Traffic (CRITICAL)

After `npx cap add android`, apply cleartext config:

### 4a. Copy network security config:
```bash
# Copy our pre-made config
copy android-resources\network_security_config.xml android\app\src\main\res\xml\network_security_config.xml
```

### 4b. Edit AndroidManifest.xml:

File: `android/app/src/main/AndroidManifest.xml`

Find the `<application` tag and add these attributes:
```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    android:usesCleartextTraffic="true"
    ...>
```

### Why is this needed?

**Android 9 (API 28+) blocks all HTTP traffic by default.** Your LAN backend
runs on `http://192.168.x.x:8000` (not HTTPS). Without cleartext enabled:
- Browser on phone: Works! (browsers have their own network stack)
- APK WebView: BLOCKED! (uses Android's strict network policy)

The `network_security_config.xml` tells Android: "Allow HTTP connections."
The `android:usesCleartextTraffic="true"` is the legacy flag for older builds.

## Step 5: Sync & Build

### Option A: Local Build (requires Android SDK)
```bash
npx cap sync android
npx cap open android    # Opens in Android Studio
# Build APK from Android Studio
```

### Option B: Cloud Build (RECOMMENDED — no Android Studio needed)

#### Using Appflow (Ionic's cloud):
```bash
npm install -g @ionic/cli
ionic cap sync android
# Then use Appflow dashboard to build
```

#### Using GitHub Actions (FREE):
See `.github/workflows/android-build.yml` (created separately)

#### Using Capacitor's own cloud (Capgo):
```bash
npx @capgo/cli init
npx @capgo/cli bundle upload
```

## Step 6: Install APK on Phone

1. Transfer the APK to your phone (USB, email, file share)
2. Enable "Install from unknown sources" in Android Settings
3. Install the APK
4. Open Store OS → Scan QR from desktop → Done!

## Ongoing Development Workflow

```bash
# After making code changes:
npm run build           # Rebuild PWA
npx cap sync android    # Sync to Android project
# Then rebuild APK
```

## Troubleshooting

### "Connection refused" in APK
- Check both devices are on the same WiFi
- Check Windows Firewall allows port 8000 (inbound rule)
- Run: `netsh advfirewall firewall add rule name="FastAPI" dir=in action=allow protocol=TCP localport=8000`

### "net::ERR_CLEARTEXT_NOT_PERMITTED"
- Cleartext traffic not enabled — redo Step 4

### QR Scanner doesn't work
- Check camera permissions in Android Settings
- Use "Enter URL Manually" as fallback

### Backend not detected (Desktop QR dialog)
- Make sure backend is running: `uvicorn main:app --host 0.0.0.0 --port 8000`
- The `--host 0.0.0.0` is critical — binds to all network interfaces
