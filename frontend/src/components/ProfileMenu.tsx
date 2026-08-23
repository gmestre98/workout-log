import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { getTheme, setTheme, type Theme } from "../theme";
import { api, UnauthorizedError } from "../api";
import { toast } from "../toast";

const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied`);
  } catch {
    toast(`Couldn't copy ${label.toLowerCase()}`, "error");
  }
}

// WatchAccess manages the long-lived token the Garmin watch app uses to log
// sets. The token is shown once, right after it is minted; afterwards only its
// active/revoked state is known (the server never returns it again).
function WatchAccess() {
  const [active, setActive] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const serverUrl = window.location.origin;

  useEffect(() => {
    api
      .watchTokenStatus()
      .then((s) => setActive(s.active))
      .catch((e) => {
        if (!(e instanceof UnauthorizedError)) setActive(false);
      });
  }, []);

  const mint = async () => {
    setBusy(true);
    try {
      const { token } = await api.mintWatchToken();
      setToken(token);
      setActive(true);
      toast("Watch token generated");
    } catch {
      toast("Couldn't generate token", "error");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await api.revokeWatchToken();
      setToken(null);
      setActive(false);
      toast("Watch access revoked");
    } catch {
      toast("Couldn't revoke", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-section">
      <div className="profile-section-title">Watch access</div>

      {token ? (
        <>
          <p className="watch-hint">
            Paste these into the watch app's settings in Garmin Connect (Connect IQ Store →
            your app → Settings). Shown once — copy it now.
          </p>
          <label className="watch-field-label">Server</label>
          <div className="watch-field">
            <code>{serverUrl}</code>
            <button className="btn tiny" onClick={() => copy(serverUrl, "Server URL")}>Copy</button>
          </div>
          <label className="watch-field-label">Token</label>
          <div className="watch-field">
            <code className="watch-token">{token}</code>
            <button className="btn tiny" onClick={() => copy(token, "Token")}>Copy</button>
          </div>
        </>
      ) : (
        <p className="watch-hint">
          {active === null
            ? "Checking…"
            : active
              ? "A watch token is active. Regenerate to set up a new watch (this invalidates the old token), or revoke to cut off access."
              : "Generate a token to log workouts from your Garmin watch. Your phone stays signed in either way."}
        </p>
      )}

      <div className="watch-actions">
        <button className="btn" onClick={mint} disabled={busy || active === null}>
          {active ? "Regenerate token" : "Generate token"}
        </button>
        {active && (
          <button className="btn danger" onClick={revoke} disabled={busy}>
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

// SheetsExport manages exporting all data into a formatted Google Sheet. The
// user connects Google once (an OAuth redirect granting the drive.file scope);
// afterwards each export creates a fresh spreadsheet in their Drive and opens
// it in a new tab.
function SheetsExport() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .sheetsStatus()
      .then((s) => setConnected(s.connected))
      .catch((e) => {
        if (!(e instanceof UnauthorizedError)) setConnected(false);
      });
  }, []);

  const connect = () => {
    // Full-page navigation into the OAuth flow; Google redirects back to the app.
    window.location.href = "/auth/sheets/connect";
  };

  const exportNow = async () => {
    setBusy(true);
    try {
      const { url } = await api.exportSheets();
      window.open(url, "_blank", "noopener");
      toast("Sheet created in your Drive");
    } catch (e) {
      // A 400 means the stored authorization is gone — send them back to connect.
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("connect")) {
        setConnected(false);
        toast("Reconnect Google Sheets to export", "error");
      } else {
        toast("Couldn't export", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.disconnectSheets();
      setConnected(false);
      toast("Google Sheets disconnected");
    } catch {
      toast("Couldn't disconnect", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-section">
      <div className="profile-section-title">Export</div>
      <p className="watch-hint">
        {connected === null
          ? "Checking…"
          : connected
            ? "Export your whole log to a new, formatted Google Sheet in your Drive."
            : "Connect Google to export your whole log into a formatted Google Sheet. Only files this app creates are accessible."}
      </p>
      <div className="watch-actions">
        {connected ? (
          <>
            <button className="btn" onClick={exportNow} disabled={busy}>
              Export to Google Sheets
            </button>
            <button className="btn danger" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn" onClick={connect} disabled={connected === null}>
            Connect Google Sheets
          </button>
        )}
      </div>
    </div>
  );
}

// ProfileMenu is the small account popup opened from the header avatar. It shows
// who's signed in, lets them switch light/dark mode, manage watch access, and
// sign out.
export function ProfileMenu({
  email,
  onClose,
  onSignOut,
}: {
  email: string;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const initial = (email.trim()[0] || "?").toUpperCase();

  const choose = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  return (
    <Modal onClose={onClose} labelledBy="profile-email">
      <div className="profile-head">
        <span className="avatar profile-avatar" aria-hidden>{initial}</span>
        <div className="profile-id">
          <div className="profile-label">Signed in as</div>
          <div className="profile-email" id="profile-email">{email}</div>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">Appearance</div>
        <div className="segmented" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`seg ${theme === t.id ? "active" : ""}`}
              aria-pressed={theme === t.id}
              onClick={() => choose(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <SheetsExport />

      <WatchAccess />

      <button className="btn danger-solid profile-signout" onClick={onSignOut}>Sign out</button>
    </Modal>
  );
}
