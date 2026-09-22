"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminUser,
  PackageTier,
  User,
  createAdminUser,
  listAdminUsers,
  logout,
  me,
  updateAdminUser,
} from "@/lib/api";

const PACKAGES: PackageTier[] = ["trial", "basic", "pro", "premium"];

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pkg, setPkg] = useState<PackageTier>("trial");
  const [makeAdmin, setMakeAdmin] = useState(false);

  async function refresh() {
    const rows = await listAdminUsers();
    setUsers(rows);
  }

  useEffect(() => {
    me()
      .then(async (u) => {
        if (!u.is_admin) {
          router.replace("/dashboard");
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

  if (!user) {
    return (
      <div className="app-shell">
        <p className="muted">Loading admin…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          VNS <span>Admin</span>
        </div>
        <nav className="nav">
          <button className="btn secondary" onClick={() => router.push("/dashboard")}>
            Dashboard
          </button>
          <span>
            {user.email} · admin
          </span>
          <button
            className="btn secondary"
            onClick={() => {
              logout();
              router.push("/");
            }}
          >
            Log out
          </button>
        </nav>
      </header>

      <div className="grid" style={{ gap: "1rem" }}>
        <section className="panel">
          <h1>User management</h1>
          <p className="muted">Create users, change packages, activate/deactivate accounts.</p>
          {error && <p className="error">{error}</p>}

          <form onSubmit={onCreate} className="grid" style={{ marginTop: "1rem", gap: "0.5rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0.75rem" }}>
              <input className="input" style={{ margin: 0 }} placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <input className="input" style={{ margin: 0 }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className="input" style={{ margin: 0 }} type="password" placeholder="Temp password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <select className="input" style={{ margin: 0 }} value={pkg} onChange={(e) => setPkg(e.target.value as PackageTier)}>
                {PACKAGES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <label className="muted" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
              Make admin
            </label>
            <div>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add user"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <h2>All users ({users.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Name</th>
                <th>Package</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.email}</td>
                  <td>{u.full_name || "—"}</td>
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
                      {u.is_active ? "active" : "disabled"}
                    </span>
                  </td>
                  <td>{u.is_admin ? "admin" : "user"}</td>
                  <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <button
                      className="btn secondary"
                      style={{ padding: "0.25rem 0.6rem" }}
                      disabled={saving}
                      onClick={() => patch(u.id, { is_active: !u.is_active })}
                    >
                      {u.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="btn secondary"
                      style={{ padding: "0.25rem 0.6rem" }}
                      disabled={saving}
                      onClick={() => patch(u.id, { extend_days: 30 })}
                    >
                      +30 days
                    </button>
                    <button
                      className="btn secondary"
                      style={{ padding: "0.25rem 0.6rem" }}
                      disabled={saving || u.id === user.id}
                      onClick={() => patch(u.id, { is_admin: !u.is_admin })}
                    >
                      {u.is_admin ? "Remove admin" : "Make admin"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
