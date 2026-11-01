/** Neutral marks. Geometric icons follow the reference shapes; no vendor logos. */

export function Mark({ letter, tone = "scout" }: { letter: string; tone?: string }) {
  return (
    <span className={`ui-mark ui-mark--${tone}`} aria-hidden="true">
      {letter.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Glyph({ d, size = 16, box = 24 }: { d: string; size?: number; box?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} fill="none" stroke="currentColor" strokeWidth={box === 12 ? 1.2 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const KIND: Record<string, string> = {
  file: "M7 1.5H3.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4Zm0 0V4h2.5",
  source: "M5 7a1.8 1.8 0 0 0 2.6 0l1.4-1.4a1.8 1.8 0 0 0-2.6-2.6l-.4.4M7 5a1.8 1.8 0 0 0-2.6 0L3 6.4A1.8 1.8 0 0 0 5.6 9l.4-.4",
  decision: "m3 6.2 2 2L9.2 4",
  fact: "M2.5 9.5v-3M5 9.5v-6M7.5 9.5V5M10 9.5V2.5",
  note: "M2.5 3h7M2.5 6h7M2.5 9h4",
};

export function KindIcon({ kind }: { kind?: string }) {
  const lost = kind === "lost";
  if (lost) {
    return (
      <svg className="ui-ahc__kind" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="m3.2 8.8 5.6-5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  return <Glyph d={KIND[kind ?? "note"] ?? KIND.note} size={12} box={12} />;
}

export function Spark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path fill="currentColor" d="M7 1.2c.4 2.9 1.9 4.4 4.8 4.8-2.9.4-4.4 1.9-4.8 4.8C6.6 7.9 5.1 6.4 2.2 6 5.1 5.6 6.6 4.1 7 1.2Z" />
      <circle cx="11.6" cy="11.4" r="1.1" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function Spin() {
  return (
    <svg className="ui-ahc__spin" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.25" />
      <path d="M6 1.4a4.6 4.6 0 0 1 4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
