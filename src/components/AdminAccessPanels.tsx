import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, LoaderCircle, RefreshCw, Save, Search, Shield, Trash2, Users } from "lucide-react";
import { getCurrentAccessToken, supabase } from "../lib/supabase";
import { useAuthAccess, type AccessLevel, type AppRole, type DashboardModule, type UserProfile } from "./AuthProvider";
import "./admin-users.css";

const roles: AppRole[] = ["student", "faculty", "technician", "admin"];
const editableRoles: AppRole[] = ["student", "faculty", "technician"];
const departments = ["EXCS", "INFT", "EXTC", "CMPN"];

function useAdminCheck() {
  const { profile } = useAuthAccess();
  return profile.role === "admin";
}

function StatusMessage({ error, success }: { error: string; success: string }) {
  if (!error && !success) return null;
  return <div className={`admin-status ${error ? "error" : "success"}`} role="status">
    {error ? <AlertCircle /> : <Check />}{error || success}
  </div>;
}

function DepartmentEditor({ user, disabled, onSave }: {
  user: UserProfile;
  disabled: boolean;
  onSave: (user: UserProfile, department: string | null) => void;
}) {
  const isKnownDepartment = departments.includes(user.department || "");
  const [choice, setChoice] = useState(user.department ? (isKnownDepartment ? user.department : "Other") : "");
  const [customDepartment, setCustomDepartment] = useState(user.department && !isKnownDepartment ? user.department : "");

  useEffect(() => {
    const known = departments.includes(user.department || "");
    setChoice(user.department ? (known ? user.department : "Other") : "");
    setCustomDepartment(user.department && !known ? user.department : "");
  }, [user.department]);

  return <div className="admin-department-editor">
    <select aria-label={`Department for ${user.user_id}`} value={choice} disabled={disabled} onChange={event => {
      const value = event.target.value;
      setChoice(value);
      if (value !== "Other") onSave(user, value || null);
    }}>
      <option value="">No department</option>
      {departments.map(department => <option key={department} value={department}>{department}</option>)}
      <option value="Other">Other</option>
    </select>
    {choice === "Other" && <input aria-label={`Custom department for ${user.user_id}`} value={customDepartment} disabled={disabled} maxLength={80} placeholder="Department name" onChange={event => setCustomDepartment(event.target.value)} onBlur={event => {
      const value = event.target.value.trim() || null;
      if (value !== user.department) onSave(user, value);
    }} />}
  </div>;
}

export function UserManagementPanel() {
  const isAdmin = useAdminCheck();
  const { userId } = useAuthAccess();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("user_profiles")
      .select("user_id, email, role, active, department")
      .order("created_at", { ascending: true });
    if (queryError) setError(queryError.message);
    else setUsers((data || []) as UserProfile[]);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function saveUser(user: UserProfile, changes: Partial<Pick<UserProfile, "role" | "active" | "department">>) {
    if (!supabase || (user.user_id === userId && ("role" in changes || "active" in changes))) return;
    setBusyUser(user.user_id);
    setError("");
    setSuccess("");
    const { error: updateError } = await supabase.from("user_profiles").update(changes).eq("user_id", user.user_id);
    if (updateError) setError(updateError.message);
    else {
      setSuccess("Account access updated.");
      await loadUsers();
    }
    setBusyUser("");
  }

  async function deleteUser(user: UserProfile) {
    const isLastActiveAdmin = user.role === "admin" && user.active && users.filter(item => item.role === "admin" && item.active).length <= 1;
    if (user.user_id === userId || isLastActiveAdmin) return;
    const description = user.email || user.user_id;
    if (!window.confirm(`Delete the account for ${description}? This permanently removes the Supabase account and its CARBengine profile.`)) return;

    const apiBase = import.meta.env.VITE_RIVER_API_URL?.trim().replace(/\/+$/, "");
    if (!apiBase) {
      setError("Account deletion needs VITE_RIVER_API_URL to point to the running Python API.");
      return;
    }
    setBusyUser(user.user_id);
    setError("");
    setSuccess("");
    try {
      const token = await getCurrentAccessToken();
      if (!token) throw new Error("Sign in again before deleting an account.");
      const response = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(user.user_id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
      if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : `Could not delete account (HTTP ${response.status}).`);
      setUsers(current => current.filter(item => item.user_id !== user.user_id));
      setSuccess(`Account ${description} was deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this account.");
    } finally {
      setBusyUser("");
    }
  }

  const activeAdminCount = users.filter(user => user.role === "admin" && user.active).length;
  const departmentOptions = [...new Set(users.map(user => user.department?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return users.filter(user => {
      const matchesSearch = !query || (user.email || "").toLocaleLowerCase().includes(query) || user.user_id.toLocaleLowerCase().includes(query);
      const matchesDepartment = departmentFilter === "all"
        || (departmentFilter === "__none__" ? !user.department : user.department === departmentFilter);
      return matchesSearch && matchesDepartment;
    });
  }, [users, search, departmentFilter]);

  if (!isAdmin) return <section className="card admin-access-denied">This page is available to administrators only.</section>;

  return <section className="admin-page">
    <div className="admin-intro card"><span className="admin-intro-icon"><Users /></span><div><h2>Manage user access</h2><p>Find accounts, assign roles and departments, or remove an account.</p></div><button className="admin-refresh" onClick={() => void loadUsers()} disabled={loading} title="Refresh users"><RefreshCw /></button></div>
    <StatusMessage error={error} success={success} />
    <section className="card admin-user-table-card">
      <div className="admin-section-title"><h3>Profiles</h3><span>{users.length} account{users.length === 1 ? "" : "s"}</span></div>
      <div className="admin-user-filters">
        <label className="admin-search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search email or account ID" aria-label="Search by email or account ID" /></label>
        <label className="admin-department-filter"><span>Department</span><select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} aria-label="Filter by department">
          <option value="all">All departments</option>
          {departmentOptions.map(department => <option key={department} value={department}>{department}</option>)}
          <option value="__none__">No department</option>
        </select></label>
      </div>
      {loading ? <div className="admin-loading"><LoaderCircle className="spin" />Loading profiles…</div> : users.length === 0 ? <div className="admin-empty">No registered profiles yet. New accounts will appear here after signing up.</div> : filteredUsers.length === 0 ? <div className="admin-empty">No accounts match this search and department filter.</div> : <div className="admin-table-scroll"><table className="admin-table admin-user-table"><thead><tr><th>Email</th><th>Account ID</th><th>Role</th><th>Department</th><th>Delete account</th></tr></thead><tbody>
        {filteredUsers.map(user => {
          const isSelf = user.user_id === userId;
          const isLastAdmin = user.role === "admin" && user.active && activeAdminCount <= 1;
          return <tr key={user.user_id}>
            <td>{user.email || "—"}</td>
            <td><span className="admin-user-id" title={user.user_id}>{user.user_id.slice(0, 8)}…{user.user_id.slice(-4)}{isSelf ? " · you" : ""}</span></td>
            <td><select aria-label={`Role for ${user.user_id}`} value={user.role} disabled={isSelf || busyUser === user.user_id || (isLastAdmin && user.role === "admin")} onChange={event => void saveUser(user, { role: event.target.value as AppRole })}>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></td>
            <td><DepartmentEditor user={user} disabled={busyUser === user.user_id} onSave={(profile, department) => void saveUser(profile, { department })} /></td>
            <td><button className="admin-delete-account" type="button" disabled={isSelf || busyUser === user.user_id || isLastAdmin} title={isSelf ? "You cannot delete your own account here" : isLastAdmin ? "The last active admin account cannot be deleted" : "Delete this account"} onClick={() => void deleteUser(user)}>{busyUser === user.user_id ? <LoaderCircle className="spin" /> : <Trash2 />}<span>{busyUser === user.user_id ? "Deleting…" : "Delete"}</span></button></td>
          </tr>;
        })}
      </tbody></table></div>}
    </section>
    <p className="admin-help"><Shield /> New accounts start with student access and save the selected department. Deleting an account permanently removes its sign-in and profile.</p>
  </section>;
}

export function TabPermissionsPanel() {
  const isAdmin = useAdminCheck();
  const { refreshAccess } = useAuthAccess();
  const [modules, setModules] = useState<DashboardModule[]>([]);
  const [permissionMap, setPermissionMap] = useState<Record<string, Record<string, AccessLevel>>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSettings = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    setLoading(true);
    setError("");
    const [moduleResult, permissionResult] = await Promise.all([
      supabase.from("dashboard_modules").select("module_key, label, enabled").order("label"),
      supabase.from("role_module_permissions").select("role, module_key, access_level"),
    ]);
    if (moduleResult.error) setError(moduleResult.error.message);
    else setModules((moduleResult.data || []) as DashboardModule[]);
    if (permissionResult.error) setError(current => current || permissionResult.error.message);
    else {
      const mapped: Record<string, Record<string, AccessLevel>> = {};
      for (const row of permissionResult.data || []) {
        mapped[row.role] ||= {};
        mapped[row.role][row.module_key] = row.access_level as AccessLevel;
      }
      setPermissionMap(mapped);
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  async function setPermission(role: AppRole, moduleKey: string, enabled: boolean) {
    if (!supabase) return;
    const key = `${role}:${moduleKey}`;
    setBusyKey(key);
    setError("");
    setSuccess("");
    const { error: upsertError } = await supabase.from("role_module_permissions").upsert(
      { role, module_key: moduleKey, access_level: enabled ? "view" : "none" },
      { onConflict: "role,module_key" },
    );
    if (upsertError) setError(upsertError.message);
    else {
      setPermissionMap(current => ({ ...current, [role]: { ...current[role], [moduleKey]: enabled ? "view" : "none" } }));
      setSuccess("Tab permissions saved.");
      await refreshAccess();
    }
    setBusyKey("");
  }

  if (!isAdmin) return <section className="card admin-access-denied">This page is available to administrators only.</section>;

  const roleGrantCount = editableRoles.reduce((total, role) => total + Object.values(permissionMap[role] || {}).filter(level => level !== "none").length, 0);

  return <section className="admin-page">
    <div className="admin-intro card"><span className="admin-intro-icon"><Shield /></span><div><h2>Role access by dashboard tab</h2><p>Enable or disable each tab for students, faculty, and technicians.</p></div><button className="admin-refresh" onClick={() => void loadSettings()} disabled={loading} title="Refresh permissions" aria-label="Refresh permissions"><RefreshCw /></button></div>
    <div className="permission-stats" aria-label="Permission overview">
      <article className="card"><small>CONFIGURABLE ROLES</small><b>3</b><span>Student · Faculty · Technician</span></article>
      <article className="card"><small>DASHBOARD TABS</small><b>{loading ? "—" : modules.length}</b><span>Configure access by role below</span></article>
      <article className="card"><small>ROLE ACCESS GRANTS</small><b>{loading ? "—" : roleGrantCount}</b><span>Non-admin tab assignments</span></article>
    </div>
    <p className="admin-help permission-note"><AlertCircle /> Each switch controls whether that role can open the tab. Admin access remains full.</p>
    <StatusMessage error={error} success={success} />
    <section className="card admin-permission-card">
      <div className="admin-section-title"><h3>Dashboard access</h3><span>{loading ? "Loading modules…" : `${modules.length} tabs · 3 configurable roles`}</span></div>
      {loading ? <div className="admin-loading"><LoaderCircle className="spin" />Loading permissions…</div> : modules.length === 0 ? <div className="admin-empty">No dashboard modules were returned. Check the table and its read policy.</div> : <div className="admin-table-scroll"><table className="admin-table permission-table"><thead><tr><th>Dashboard tab</th>{editableRoles.map(role => <th key={role}>{role}</th>)}<th>Admin</th></tr></thead><tbody>
        {modules.map(module => <tr key={module.module_key}>
          <td><b>{module.label}</b><small>{module.module_key}</small></td>
          {editableRoles.map(role => {
            const key = `${role}:${module.module_key}`;
            const enabled = Boolean(permissionMap[role]?.[module.module_key] && permissionMap[role][module.module_key] !== "none");
            return <td key={role}><div className="permission-toggle-cell"><button className={`admin-toggle ${enabled ? "on" : ""}`} type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? "Disable" : "Enable"} ${role} access to ${module.label}`} disabled={busyKey === key} onClick={() => void setPermission(role, module.module_key, !enabled)}><i /></button><span>{busyKey === key ? <LoaderCircle className="spin" /> : enabled ? "Enabled" : "Disabled"}</span></div></td>;
          })}
          <td><span className="admin-full-access">Full</span></td>
        </tr>)}
      </tbody></table></div>}
    </section>
    <p className="admin-help permission-save-note"><Save /> Changes save to Supabase as you make them. Admin access remains full.</p>
  </section>;
}
