/**
 * Studio shell. Structure follows the affectUI home (`.ui-as`), with our own icons.
 */
import { useRef, useState, type ReactNode } from "react";

import { Glyph } from "./marks.js";

const ICONS = {
  home: "M4 11 12 4l8 7v9H4v-9Z",
  branches: "M7 4v6a3 3 0 0 0 3 3h3M13 4v4M17 4v10",
  experiments: "M5 19V9m7 10V5m7 14v-7",
  tickets: "M6 4h12v16H6zM9 8h6M9 12h6",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5 2 4 4",
  collapse: "M8 6h8M8 12h8M8 18h5",
};

export function AppShell({
  repo,
  areas,
  news,
  coverage,
  user,
  panel,
  onNavigate,
  onArea,
  children,
}: {
  repo: string;
  areas: { id: string; label: string }[];
  news: { title: string; kicker: string }[];
  coverage: number;
  user: string;
  panel: ReactNode | null;
  onNavigate: (id: string) => void;
  onArea: (id: string) => void;
  children: ReactNode;
}) {
  const [width, setWidth] = useState(272);
  const [collapsed, setCollapsed] = useState(false);
  const drag = useRef(false);
  const side = collapsed ? 0 : width;

  return (
    <div
      className="ui-as ui-as-app"
      style={{ ["--side-w" as string]: `${side}px`, ["--panel-w" as string]: panel ? "360px" : "0px" }}
    >
      {collapsed ? (
        <button type="button" className="ui-as-icon-btn ui-as-side-open" aria-label="Open sidebar" onClick={() => setCollapsed(false)}>
          <Glyph d={ICONS.home} />
        </button>
      ) : null}
      <div
        className="ui-as-resizer"
        data-edge="left"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={220}
        aria-valuemax={380}
        onPointerDown={(event) => {
          drag.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current || collapsed) return;
          setWidth(Math.min(380, Math.max(220, event.clientX)));
        }}
        onPointerUp={() => {
          drag.current = false;
        }}
      />
      <aside className="ui-as-side" aria-hidden={collapsed}>
        <header className="ui-as-side__head">
          <button type="button" className="ui-as-side__workspace">
            <span className="ui-as-side__logo">L</span>
            <span className="ui-as-side__name">{repo}</span>
          </button>
          <span className="ui-as-side__tools">
            <button type="button" className="ui-as-icon-btn" aria-label="Search" onClick={() => onNavigate("sec-queue")}>
              <Glyph d={ICONS.search} />
            </button>
            <button type="button" className="ui-as-icon-btn" aria-label="Collapse sidebar" onClick={() => setCollapsed(true)}>
              <Glyph d={ICONS.collapse} />
            </button>
          </span>
        </header>
        <nav className="ui-as-side__nav" aria-label="Main menu">
          <div className="ui-as-side__group">
            {(
              [
                ["home", "Home", "top", ICONS.home],
                ["branches", "Branches", "sec-tree", ICONS.branches],
                ["experiments", "Experiments", "sec-runs", ICONS.experiments],
                ["tickets", "Tickets", "sec-queue", ICONS.tickets],
              ] as const
            ).map(([id, label, target, icon]) => (
              <button key={id} type="button" className="ui-as-side__item" aria-current={id === "home" ? "page" : undefined} onClick={() => onNavigate(target)}>
                <Glyph d={icon} />
                <span className="ui-as-side__text">{label}</span>
              </button>
            ))}
          </div>
          <span className="ui-as-side__label">Projects</span>
          {areas.map((area) => (
            <button key={area.id} type="button" className="ui-as-side__item" onClick={() => onArea(area.id)}>
              <span className="ui-as-side__text">{area.label}</span>
            </button>
          ))}
        </nav>
        <div className="ui-as-side__foot">
          {news[0] ? (
            <div className="ui-as-news" data-count={news.length}>
              <div className="ui-as-news__card ui-as-news__card--back" />
              <div className="ui-as-news__card">
                <div className="ui-as-news__top">{news[0].kicker}</div>
                <b className="ui-as-news__title">{news[0].title}</b>
                <button type="button" className="ui-as-news__more" onClick={() => onNavigate("sec-ledger")}>
                  Full ledger &gt;
                </button>
              </div>
            </div>
          ) : null}
          <div className="ui-as-guide-slot">
            <div className="ui-as-guide" data-state="closed">
              <button type="button" className="ui-as-steps" onClick={() => onNavigate("sec-runs")}>
                <span className="ui-as-steps__title">Experiment coverage &gt;</span>
                <span className="ui-as-steps__sub">
                  {coverage}% done · <span className="ui-as-steps__cheer">{coverage >= 50 ? "Solid coverage" : "Great start!"}</span>
                </span>
                <span className="ui-as-steps__bar">
                  <i style={{ width: `${coverage}%` }} />
                </span>
              </button>
            </div>
          </div>
          <button type="button" className="ui-as-user">
            <span className="ui-as-user__initials">{user.slice(0, 2).toUpperCase()}</span>
            <span className="ui-as-user__name">{user}</span>
          </button>
        </div>
      </aside>
      <main className="ui-as-main">{children}</main>
      <aside className="ui-as-panel" aria-label="Branch details" hidden={!panel}>
        {panel}
      </aside>
    </div>
  );
}
