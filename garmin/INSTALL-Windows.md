# Install the Workout Log watch app on your fenix 6 Pro (Windows)

This is the Windows equivalent of `setup.sh` / `build.sh` (those are macOS-only).
The end result is a `bin\workout-log.prg` file that you copy onto the watch.

---

## ✅ Already done on this machine (set up by Claude)

You do **not** need to repeat these — they're installed/created:

- **JDK 17** — extracted to `C:\Users\Goncalo\garmin-tools\jdk-17.0.20.1+1`,
  with `JAVA_HOME` and PATH set at user level. (Open a **new** terminal for it to
  take effect: `java -version` should print 17.)
- **VS Code** — already installed (v1.135.0).
- **Garmin Monkey C extension** — installed (v1.1.3).
- **Developer signing key** — generated at
  `C:\Users\Goncalo\garmin\developer_key.der`. Keep this file; reuse it for every
  rebuild.
- **Connect IQ SDK Manager** — downloaded to
  `C:\Users\Goncalo\garmin-tools\sdkmanager\sdkmanager.exe`.

### 👉 What's left for you (needs your Garmin login — Claude can't do this)

1. Run `C:\Users\Goncalo\garmin-tools\sdkmanager\sdkmanager.exe`, **sign in with
   your Garmin account**, accept the agreement, and **download the latest SDK**.
2. In the SDK Manager's **Devices** tab, download **fenix 6 Pro**.
3. Then build — the key already exists, so from PowerShell in this `garmin` folder:
   ```powershell
   .\build.ps1 -KeyPath "C:\Users\Goncalo\garmin\developer_key.der"
   ```
   (or use VS Code → "Monkey C: Build for Device" → fenix 6 Pro).
4. Sideload `bin\workout-log.prg` — see **Install on the watch** below.

The full reference (both routes) is below.

---

You only need to do the **one-time setup** (steps 1–4) once. After that, rebuilding
is just step 5, and re-installing is step 6.

There are two routes. **Route A (VS Code) is recommended** — it's the least
error-prone on Windows and does the SDK/key/build work for you through a menu.
Route B is the command line, for when you want a repeatable script.

---

## Route A — VS Code + Garmin's Monkey C extension (recommended)

### 1. Install the prerequisites
- **JDK 17** (the compiler needs Java 17+). Install Temurin/Adoptium JDK 17
  from https://adoptium.net and let it set `JAVA_HOME`.
- **VS Code** from https://code.visualstudio.com.
- In VS Code, install the **"Monkey C"** extension published by **Garmin**
  (Extensions panel → search "Monkey C").

### 2. Download the Connect IQ SDK
- Press `Ctrl+Shift+P` → **"Monkey C: Open SDK Manager"** (this downloads and
  launches Garmin's SDK Manager the first time).
- In the SDK Manager: sign in with your **Garmin account** (your password is
  entered on Garmin's own page — never seen by me or by these files), accept the
  agreement, and **download the latest SDK**.
- Still in the SDK Manager, go to the **Devices** tab and download **fenix 6 Pro**.

### 3. Generate a developer (signing) key — one time, keep it forever
- `Ctrl+Shift+P` → **"Monkey C: Generate a Developer Key"**.
- Save it somewhere stable, e.g. `C:\Users\Goncalo\garmin\developer_key.der`.
  Reuse this same key for every future rebuild so the watch treats new builds as
  updates of the same app, not a new one.

### 4. Open the project
- In VS Code: **File → Open Folder** → select this `garmin` folder
  (`C:\Users\Goncalo\projects\workout-log\garmin`).

### 5. Build
- `Ctrl+Shift+P` → **"Monkey C: Build for Device"**.
- Pick **fenix 6 Pro** as the device (and your developer key if asked).
- The output `.prg` is written into the folder — note where VS Code reports it
  (typically `bin\` inside this folder). That file is what you sideload.

Then go to **"Install on the watch"** below.

---

## Route B — Command line (repeatable, uses build.ps1)

Use this once you've done Route A steps 1–3 (JDK 17, SDK + fenix 6 Pro device,
and a developer key), or after installing the standalone
[Connect IQ SDK Manager for Windows](https://developer.garmin.com/connect-iq/sdk/)
and downloading the SDK + fenix 6 Pro device + generating a key through it.

From **PowerShell**, in this `garmin` folder:

```powershell
# Point this at wherever you saved your developer key (Route A step 3).
.\build.ps1 -KeyPath "C:\Users\Goncalo\garmin\developer_key.der"
```

`build.ps1` finds your installed SDK automatically, compiles for `fenix6pro`, and
writes `bin\workout-log.prg`. If it can't find the SDK it will tell you to open
the SDK Manager once (Route A step 2).

---

## Install on the watch (sideload)

1. Plug the **fenix 6 Pro** into the PC with a USB cable.
2. It appears in File Explorer as a **GARMIN** drive (it may show as
   `Garmin\fenix6Pro` or similar).
3. Copy `bin\workout-log.prg` into the watch's **`GARMIN\APPS\`** folder.
4. Safely eject and unplug. The app shows up on the watch under
   **Activities & Apps** (press START) as **Workout Log**.

---

## Configure the app (one time, from your phone)

The watch reaches the internet **through your phone**, so keep your phone nearby
with **Garmin Connect Mobile** running.

1. In the Workout Log phone/web app, open the **profile popup → Watch access →
   Generate token**. Copy the **Server URL** and the **Token**.
2. In **Garmin Connect Mobile**: **Connect IQ Store → My Apps → Workout Log →
   Settings**, and paste the **Server URL** and **Watch token**.

## Controls on the watch
- **START** — begin a set / finish a set / skip rest
- **BACK** — leave the exercise (saves the sets you completed)
- **UP / DOWN** — scroll the exercise list

---

## Troubleshooting
- **"No Connect IQ SDK found"** when running `build.ps1` — open the SDK Manager
  once (Route A step 2) and download an SDK; it records the active SDK that the
  script reads.
- **`monkeyc` / Java errors** — confirm `java -version` prints 17+ in a new
  PowerShell window; reinstall Temurin JDK 17 if not.
- **App says "Open Garmin Connect and set the Server URL and Watch token"** — the
  settings aren't filled in yet; do the **Configure** section above.
- **App says "Couldn't reach server"** — your phone isn't nearby / Garmin Connect
  Mobile isn't running, or the Server URL/token is wrong.
