// SignIn is shown when there is no valid session. The button navigates to the
// server's Google OAuth entrypoint (a full-page redirect, not fetch).
export function SignIn() {
  return (
    <div className="center signin">
      <h1>Workout Log</h1>
      <p className="muted">Track your daily routine.</p>
      <a className="btn primary" href="/auth/login">
        Sign in with Google
      </a>
    </div>
  );
}
