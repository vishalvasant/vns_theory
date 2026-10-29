"use client";

import { useRouter } from "next/navigation";
import type { User } from "@/lib/api";
import { logout } from "@/lib/api";

type Props = {
  user: User;
  active: "today" | "watch" | "learn";
};

export default function AppHeader({ user, active }: Props) {
  const router = useRouter();

  return (
    <header className="appbar">
      <div className="logo">
        VNS <em>Analytics</em>
      </div>
      <nav className="app-nav">
        <button type="button" className={active === "today" ? "on" : ""} onClick={() => router.push("/today")}>
          Today
        </button>
        <button type="button" className={active === "watch" ? "on" : ""} onClick={() => router.push("/watch")}>
          Watch
        </button>
        <button type="button" className={active === "learn" ? "on" : ""} onClick={() => router.push("/guide")}>
          Learn
        </button>
        {user.is_admin && (
          <button type="button" onClick={() => router.push("/admin")}>
            Admin
          </button>
        )}
      </nav>
      <div className="who">
        <span className="pill">{user.package}</span>
        <span>{user.email}</span>
        <button
          className="btn secondary"
          style={{ padding: "0.3rem 0.65rem" }}
          type="button"
          onClick={() => {
            logout();
            router.push("/");
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
