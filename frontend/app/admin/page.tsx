"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell, { type AdminNavId } from "@/components/AppShell";
import {
  AdminUser,
  PackageTier,
  User,
  createAdminUser,
  listAdminUsers,
  logout,
  me,
  triggerSync,
  updateAdminUser,
} from "@/lib/api";

const PACKAGES: PackageTier[] = ["trial", "basic", "pro", "premium"];

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState<AdminNavId>("pulse");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pkg, setPkg] = useState<PackageTier>("trial");
  const [makeAdmin, setMakeAdmin] = useState(false);

  async function refresh() {
    setUsers(await listAdminUsers());
  }

  useEffect(() => {
    me()
      .then(async (u) => {
        if (!u.is_admin) {
          router.replace("/today");
          return;
        }
        setUser(u);
        await refresh();
      })
      .catch(() => {
        logout();
        router.replace("/");
      });
  }, [router]);

  const kpis = useMemo(() => {
    const active = users.filter((u) => u.is_active).length;
    const trials = users.filter((u) => u.package === "trial").length;
    const paying = users.filter((u) => u.is_active && u.package !== "trial").length;
    return { active, trials, paying, total: users.length };
  }, [users]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createAdminUser({
        email,
        password,
        full_name: fullName,
        package: pkg,
        is_admin: makeAdmin,
        trial_days: 14,
      });
      setEmail("");
      setPassword("");
      setFullName("");
      setPkg("trial");
      setMakeAdmin(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: number, payload: Parameters<typeof updateAdminUser>[1]) {
    setSaving(true);
    setError("");
    try {
      await updateAdminUser(id, payload);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onSync() {
    setSyncing(true);
    setSyncMsg("");
    setError("");
    try {
      const res = await triggerSync(undefined, true);
      setSyncMsg(
        `Synced ${res.synced} · analyzed ${res.analyzed} · candles ${res.candle_rows} · errors ${res.errors?.length || 0}`
      );
      if (res.errors?.length) setError(res.errors.slice(0, 3).join(" | "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (!user) {
    return (
      <div className="wrap">
        <p className="muted">Loading admin…</p>
      </div>
    );
  }

  const title =
    tab === "pulse" ? "Business pulse" : tab === "members" ? "Members" : "Data health";
  const subtitle =
    tab === "pulse"
      ? "Seats, trials, and product health"
      : tab === "members"
        ? "Create, extend, suspend accounts"
        : "Keep Upstox sync green before market open";

  return (
    <AppShell
      mode="admin"
      user={user}
      active={tab}
      title={title}
      subtitle={subtitle}
      onNavigate={setTab}
      actions={
        tab === "data" ? (
          <button className="btn" type="button" onClick={onSync} disabled={syncing}>
            {syncing ? "Running…" : "Run sync now"}
          </button>
        ) : null
      }
    >
      {error && <p className="error">{error}</p>}

      <div className="kpi">
        <div className="mood-card">
          <div className="k">Paying</div>
          <div className="v" style={{ color: "var(--teal)" }}>
            {kpis.paying}
          </div>
          <div className="s">Active paid seats</div>
        </div>
        <div className="mood-card">
          <div className="k">Trials</div>
          <div className="v" style={{ color: "var(--gold)" }}>
            {kpis.trials}
          </div>
          <div className="s">Convert this week</div>
        </div>
        <div className="mood-card">
          <div className="k">Active</div>
          <div className="v">{kpis.active}</div>
          <div className="s">All active accounts</div>
        </div>
        <div className="mood-card">
          <div className="k">Total</div>
          <div className="v">{kpis.total}</div>
          <div className="s">Registered users</div>
        </div>
      </div>

      {(tab === "pulse" || tab === "members") && (
        <div className="admin-grid">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.email}
                    {u.is_admin ? " · admin" : ""}
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ margin: 0, width: "auto", padding: "0.35rem 0.5rem" }}
                      value={u.package}
                      disabled={saving}
                      onChange={(e) => patch(u.id, { package: e.target.value as PackageTier })}
                    >
                      {PACKAGES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="muted">{u.package_expires_at ? String(u.package_expires_at).slice(0, 10) : "—"}</td>
                  <td>
                    <span className={`badge ${u.is_active ? "ok" : "danger"}`}>
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <button className="ghost" type="button" disabled={saving} onClick={() => patch(u.id, { extend_days: 30 })}>
                      Extend
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      disabled={saving}
                      onClick={() => patch(u.id, { is_active: !u.is_active })}
                    >
                      {u.is_active ? "Suspend" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="panel">
            <h3>Add member</h3>
            <form onSubmit={onCreate}>
              <input className="input" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input
                className="input"
                type="password"
                placeholder="Temp password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <select className="input" value={pkg} onChange={(e) => setPkg(e.target.value as PackageTier)}>
                {PACKAGES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <label className="muted" style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
                Make admin
              </label>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add member"}
              </button>
            </form>
          </div>
        </div>
      )}

      {(tab === "pulse" || tab === "data") && (
        <div className="panel" style={{ marginTop: tab === "pulse" ? "1rem" : 0 }}>
          <h3>Data health</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Keep sync green before market open. Pulls Nifty 50 candles (15m→Monthly) and recomputes VNS marks.
          </p>
          <button className="btn" type="button" onClick={onSync} disabled={syncing}>
            {syncing ? "Running…" : "Run sync now"}
          </button>
          {syncMsg && <p className="muted">{syncMsg}</p>}
        </div>
      )}
    </AppShell>
  );
}
