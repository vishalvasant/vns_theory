"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/api";
import { logout } from "@/lib/api";

export type UserNavId = "today" | "watch" | "learn";
export type AdminNavId = "pulse" | "members" | "data";

type UserShellProps = {
  mode: "user";
  user: User;
  active: UserNavId;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

type AdminShellProps = {
  mode: "admin";
  user: User;
  active: AdminNavId;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onNavigate?: (id: AdminNavId) => void;
  children: ReactNode;
};

type Props = UserShellProps | AdminShellProps;

const STORAGE_KEY = "vns_sidebar_open";
const MOBILE_MQ = "(max-width: 960px)";

function IconPanel({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 2v12" stroke="currentColor" strokeWidth="1.4" />
      {open ? (
        <path d="M9.5 6L8 8l1.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M8.5 6L10 8l-1.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconToday() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconWatch() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3 14l4-5 3 3 4-6 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 16.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconGuide() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 4.5h8.5a2 2 0 012 2V16H6a2 2 0 01-2-2V4.5z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 8h6M7 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function AppShell(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const apply = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (mobile) {
        setOpen(false);
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        setOpen(saved !== "0");
      }
      setReady(true);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!ready || !isMobile) return;
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open, isMobile, ready]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (!isMobile) localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function closeMobile() {
    if (isMobile) setOpen(false);
  }

  function goUser(id: UserNavId) {
    if (id === "today") router.push("/today");
    if (id === "watch") router.push("/watch");
    if (id === "learn") router.push("/guide");
    closeMobile();
  }

  const isAdminMode = props.mode === "admin";

  return (
    <div
      className={`shell ${open ? "shell-open" : "shell-closed"} ${ready ? "shell-ready" : ""} ${
        isMobile ? "shell-mobile" : "shell-desktop"
      }`}
    >
      {open && isMobile ? (
        <button type="button" className="shell-backdrop" aria-label="Close menu" onClick={closeMobile} />
      ) : null}

      <aside
        className="shell-side"
        aria-hidden={isMobile ? !open : false}
        {...(isMobile && !open ? ({ inert: "" } as Record<string, string>) : {})}
      >
        <div className="shell-brand">
          <div className="brand-mark">
            <span className="brand-glyph">V</span>
            <div className="brand-text">
              <strong>VNS</strong>
              <span>Analytics</span>
            </div>
          </div>
          <button type="button" className="shell-icon-btn" onClick={toggle} title="Close menu" aria-label="Close menu">
            <IconPanel open />
          </button>
        </div>

        {isAdminMode ? (
          <>
            <div className="shell-section">Operations</div>
            <nav className="shell-nav">
              {(
                [
                  ["pulse", "Overview"],
                  ["members", "Members"],
                  ["data", "Data sync"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`shell-link ${props.active === id ? "on" : ""}`}
                  onClick={() => {
                    props.onNavigate?.(id);
                    closeMobile();
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="shell-section">Product</div>
            <nav className="shell-nav">
              <button
                type="button"
                className="shell-link"
                onClick={() => {
                  router.push("/today");
                  closeMobile();
                }}
              >
                Open Today
              </button>
            </nav>
          </>
        ) : (
          <>
            <div className="shell-section">Workspace</div>
            <nav className="shell-nav">
              <button
                type="button"
                className={`shell-link ${props.active === "today" ? "on" : ""}`}
                onClick={() => goUser("today")}
              >
                Today
              </button>
              <button
                type="button"
                className={`shell-link ${props.active === "watch" ? "on" : ""}`}
                onClick={() => goUser("watch")}
              >
                Watch
              </button>
              <button
                type="button"
                className={`shell-link ${props.active === "learn" ? "on" : ""}`}
                onClick={() => goUser("learn")}
              >
                Guide
              </button>
            </nav>
            {props.user.is_admin && (
              <>
                <div className="shell-section">Admin</div>
                <nav className="shell-nav">
                  <button
                    type="button"
                    className="shell-link"
                    onClick={() => {
                      router.push("/admin");
                      closeMobile();
                    }}
                  >
                    Console
                  </button>
                </nav>
              </>
            )}
          </>
        )}

        <div className="shell-foot">
          <div className="shell-user-card">
            <div className="shell-avatar">{(props.user.full_name || props.user.email).slice(0, 1).toUpperCase()}</div>
            <div className="shell-user-meta">
              <strong>{props.user.full_name || props.user.email.split("@")[0]}</strong>
              <span>{props.user.email}</span>
            </div>
            <span className="pill">{props.user.package}</span>
          </div>
          <button
            type="button"
            className="shell-logout"
            onClick={() => {
              logout();
              router.push("/");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-top">
          <div className="shell-top-left">
            <button
              type="button"
              className="shell-icon-btn light shell-menu-btn"
              onClick={toggle}
              title={open ? "Close menu" : "Open menu"}
              aria-label={open ? "Close menu" : "Open menu"}
            >
              {isMobile ? <IconMenu /> : <IconPanel open={open} />}
            </button>
            <div className="shell-heading">
              <h1 className="shell-title">{props.title}</h1>
              {props.subtitle ? <p className="shell-sub">{props.subtitle}</p> : null}
            </div>
          </div>
          <div className="shell-top-actions">
            {props.actions}
            {!isMobile && (
              <button type="button" className="btn secondary desktop-only" onClick={toggle}>
                {open ? "Focus mode" : "Show menu"}
              </button>
            )}
          </div>
        </header>
        <div className="shell-content">{props.children}</div>
      </div>

      {!isAdminMode && (
        <nav className="mobile-tabbar" aria-label="Primary">
          <button type="button" className={props.active === "today" ? "on" : ""} onClick={() => goUser("today")}>
            <IconToday />
            Today
          </button>
          <button type="button" className={props.active === "watch" ? "on" : ""} onClick={() => goUser("watch")}>
            <IconWatch />
            Watch
          </button>
          <button type="button" className={props.active === "learn" ? "on" : ""} onClick={() => goUser("learn")}>
            <IconGuide />
            Guide
          </button>
        </nav>
      )}
    </div>
  );
}
