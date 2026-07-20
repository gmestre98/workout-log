// Small stroke icon set, sized by the parent's font/SVG rules.
type P = { className?: string };
const s = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconToday = (p: P) => (
  <svg viewBox="0 0 24 24" {...s} {...p}><path d="M3 12l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
);
export const IconHistory = (p: P) => (
  <svg viewBox="0 0 24 24" {...s} {...p}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
);
export const IconStats = (p: P) => (
  <svg viewBox="0 0 24 24" {...s} {...p}><path d="M4 19V5M4 19h16M9 16V9M14 16v-5M19 16V7" /></svg>
);
export const IconRoutine = (p: P) => (
  <svg viewBox="0 0 24 24" {...s} {...p}><path d="M4 6h16M4 12h16M4 18h10" /></svg>
);
export const IconPlus = (p: P) => (
  <svg viewBox="0 0 24 24" {...s} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconCheck = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} {...p}><path d="M5 13l4 4L19 7" /></svg>
);
export const IconTimer = (p: P) => (
  <svg viewBox="0 0 24 24" {...s} {...p}><circle cx="12" cy="13" r="8" /><path d="M12 13V9M9 2h6" /></svg>
);
export const IconDumbbell = (p: P) => (
  <svg viewBox="0 0 24 24" {...s} {...p}><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></svg>
);
