import { useState } from "react";
import { Modal } from "./Modal";
import { getTheme, setTheme, type Theme } from "../theme";

const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

// ProfileMenu is the small account popup opened from the header avatar. It shows
// who's signed in, lets them switch light/dark mode, and offers sign out.
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

      <button className="btn danger-solid profile-signout" onClick={onSignOut}>Sign out</button>
    </Modal>
  );
}
