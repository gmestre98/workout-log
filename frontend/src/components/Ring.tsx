import { formatPercent } from "../format";

const R = 52;
const CIRC = 2 * Math.PI * R;

// Ring renders the ember completion ring used on Today. value is a fraction
// in [0, 1].
export function Ring({ value, label = "Today" }: { value: number; label?: string }) {
  const offset = CIRC * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" width="116" height="116" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--track)" strokeWidth="11" />
        <circle
          className="prog"
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="url(#emberRing)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
        <defs>
          <linearGradient id="emberRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ember)" />
            <stop offset="1" stopColor="var(--ember-2)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="center">
        <div className="pct num">{formatPercent(value)}</div>
        <div className="lab">{label}</div>
      </div>
    </div>
  );
}
