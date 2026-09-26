import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { v2 } from "../v2api";
import type { AdminStats, AdminUserRow, Role } from "../types";

// Admins see account facts only (never profile data such as accessibility, age or diet).
export default function AdminPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [temp, setTemp] = useState<Record<number, string>>({});

  const load = async () => {
    const [u, s] = await Promise.all([v2.adminUsers(), v2.adminStats()]);
    setRows(u); setStats(s);
  };
  useEffect(() => { load().catch((e) => setError(String(e))); }, []);
  const patch = async (id: number, p: Parameters<typeof v2.adminPatch>[1], done: string) => {
    setError(""); setNote("");
    try { await v2.adminPatch(id, p); await load(); setNote(done); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section className="page">
      <h2>Admin</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="ok" role="status">{note}</p>}
      {stats && (
        <div className="stats">
          <div><strong>{stats.users}</strong><span>users</span></div>
          <div><strong>{stats.admins}</strong><span>admins</span></div>
          <div><strong>{stats.providers}</strong><span>providers</span></div>
          <div><strong>{stats.disabled}</strong><span>disabled</span></div>
          <div><strong>{stats.active_sessions}</strong><span>active sessions</span></div>
          <div><strong>{stats.provider_listings}</strong><span>provider listings</span></div>
        </div>
      )}
      <div className="panel table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Temporary password</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.display_name}</strong><div className="muted small">{r.email}</div></td>
                <td>
                  <select aria-label={`Role for ${r.email}`} value={r.role}
                    onChange={(e) => patch(r.id, { role: e.target.value as Role }, `${r.email} is now ${e.target.value}.`)}>
                    <option value="traveler">traveler</option><option value="provider">provider</option><option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <label className="check">
                    <input type="checkbox" checked={!r.disabled} disabled={r.id === user?.id}
                      onChange={(e) => patch(r.id, { disabled: !e.target.checked }, `${r.email} ${e.target.checked ? "enabled" : "disabled and signed out"}.`)} />
                    {r.disabled ? "disabled" : "active"}
                  </label>
                </td>
                <td className="small">{r.last_login ? r.last_login.replace("T", " ").slice(0, 16) : "never"}</td>
                <td>
                  <form className="inline" onSubmit={(e) => { e.preventDefault(); patch(r.id, { temp_password: temp[r.id] }, `Temporary password set for ${r.email}; they were signed out.`); setTemp({ ...temp, [r.id]: "" }); }}>
                    <input type="text" minLength={8} placeholder="8+ characters" aria-label={`Temporary password for ${r.email}`}
                      value={temp[r.id] ?? ""} onChange={(e) => setTemp({ ...temp, [r.id]: e.target.value })} />
                    <button className="secondary mini" disabled={(temp[r.id] ?? "").length < 8}>Set</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
