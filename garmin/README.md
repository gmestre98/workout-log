# Workout Log — Garmin watch app (fenix 6 Pro)

A small Connect IQ (Monkey C) app to run your workout from the wrist: pick an
active exercise, run the set timer / rest countdown (with a buzz at each end),
and log the completed sets straight to the backend. It authenticates with a
**watch token** you generate in the phone app's profile popup — no Google login
on the watch.

The watch reaches the internet **through your phone**: the Garmin Connect Mobile
app relays the HTTPS requests over Bluetooth, so keep your phone nearby with
Garmin Connect running.

## Layout

```
manifest.xml              app id, fenix6pro target, Communications permission
monkey.jungle             build config
resources/
  strings/                UI strings
  drawables/              launcher icon
  settings/               serverUrl + apiToken (edited from Garmin Connect)
source/
  WorkoutLogApp.mc        entry point
  Config.mc               reads settings, date helper
  Api.mc                  GET /api/exercises, GET/PUT /api/days/{date}
  Fmt.mc                  string formatters
  MainView.mc             loading screen + exercise picker
  ExerciseMenuDelegate.mc opens the timer for the chosen exercise
  WorkoutView.mc          set/rest timer state machine + save
```

## Toolchain

Everything lives under `~/garmin-toolchain` (no Homebrew / sudo needed):

- `jdk17/` — Temurin JDK 17 (monkeyc needs Java 17+)
- `bin/connect-iq-sdk-manager` — headless SDK/device downloader
- `developer_key.der` — your app signing key (keep it; reuse for every rebuild)

## Build

```bash
# One-time: accept agreement, log in to Garmin (browser), download SDK + device.
# Your Garmin password is entered on Garmin's page — not stored by these scripts.
./setup.sh

# Compile to bin/workout-log.prg
./build.sh
```

## Install on the watch (sideload)

1. Connect the fenix 6 Pro to the Mac with a USB cable.
2. It mounts as a `GARMIN` drive. Copy `bin/workout-log.prg` into the
   `GARMIN/APPS/` folder.
3. Eject and unplug. The app appears in the watch's activity/app list as
   **Workout Log**.

## Configure

1. In the phone app, open the profile popup → **Watch access** → **Generate
   token**. Copy the **Server URL** and **Token**.
2. In **Garmin Connect Mobile**: Connect IQ Store → the Workout Log app →
   **Settings** → paste the Server URL and Token.

## Controls

- **START** — begin a set / finish a rep set / skip rest
- **BACK** — leave the exercise (saves the sets you completed)
- **UP / DOWN** — scroll the exercise list
