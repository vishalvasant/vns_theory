"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login, me, register } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("admin@vns.app");
  const [password, setPassword] = useState("admin12345");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "register") {
        await register(email, password, fullName);
      }
      await login(email, password);
      const u = await me();
      router.push(u.is_admin ? "/admin" : "/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <div className="brand-mark">
          <span className="brand-glyph">V</span>
          <div className="brand-text">
            <strong>VNS</strong>
            <span>Analytics</span>
          </div>
        </div>
        <div>
          <h1>Market structure, clearly.</h1>
          <p>
            Professional VNS reads for Nifty 50 — daily setups, script-level analysis, and
            Teji / Mandi / DT / DB without the noise.
          </p>
        </div>
        <p className="muted" style={{ color: "#64748b", fontSize: "0.82rem", margin: 0 }}>
          Built for traders who want decisions, not dashboards full of clutter.
        </p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow" style={{ marginTop: 0 }}>
            {mode === "login" ? "Sign in" : "Start trial"}
          </p>
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="muted" style={{ marginTop: 0, marginBottom: "1.1rem" }}>
            {mode === "login"
              ? "Access Today, Watch, and your package workspace."
              : "14-day trial with Nifty 50 coverage."}
          </p>
          <form onSubmit={onSubmit}>
            {mode === "register" && (
              <input
                className="input"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            )}
            <input
              className="input"
              type="email"
              placeholder="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {error && <p className="error">{error}</p>}
            <button className="btn" disabled={loading} type="submit" style={{ width: "100%" }}>
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create trial account"}
            </button>
          </form>
          <p className="muted" style={{ marginTop: "1rem", marginBottom: 0, fontSize: "0.86rem" }}>
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="btn secondary"
              style={{ padding: "0.25rem 0.55rem", marginLeft: "0.25rem" }}
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Start trial" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
