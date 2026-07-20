import { IconDumbbell } from "./icons";

// SignIn is shown when there is no valid session. The button is a full-page
// navigation to the server's Google OAuth entrypoint (not a fetch).
export function SignIn() {
  return (
    <div className="signin">
      <div className="mark"><IconDumbbell /></div>
      <h1>Workout Log</h1>
      <p>Track your day, dawn to dusk.</p>
      <a className="gbtn" href="/auth/login">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.9 2.5 2.8 6.6 2.8 12S6.9 21.5 12 21.5c6 0 8.9-4.2 8.9-8.6 0-.6-.1-1-.1-1.5H12z"/></svg>
        Sign in with Google
      </a>
    </div>
  );
}
