import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity, Leaf, LockKeyhole, LogIn, LogOut, ShieldCheck } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import "./auth.css";
import "./signup-department.css";

export type AppRole = "admin" | "student" | "faculty" | "technician";
export type AccessLevel = "none" | "view" | "limited" | "department" | "device" | "manage";

export type UserProfile = {
  user_id: string;
  email?: string | null;
  role: AppRole;
  active: boolean;
  department: string | null;
};

export type DashboardModule = {
  module_key: string;
  label: string;
  enabled: boolean;
};

type AccessContextValue = {
  userId: string;
  email: string;
  profile: UserProfile;
  modules: DashboardModule[];
  permissions: Record<string, AccessLevel>;
  accessError: string;
  canAccessModule: (moduleKey: string) => boolean;
  refreshAccess: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue | null>(null);
const signupDepartments = ["EXCS", "INFT", "EXTC", "CMPN", "Other"] as const;

export function useAuthAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAuthAccess must be used inside AuthProvider.");
  return value;
}

function withTimeout<T>(operation: PromiseLike<T>, description: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${description} timed out. Check your connection and try again.`)), timeoutMs);
    Promise.resolve(operation).then(
      value => { window.clearTimeout(timeout); resolve(value); },
      error => { window.clearTimeout(timeout); reject(error); },
    );
  });
}

function AuthScreen({ initialMessage = "" }: { initialMessage?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [messageType, setMessageType] = useState<"error" | "success">("error");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (mode === "signup" && password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      setMessageType("error");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setMessage("The passwords do not match.");
      setMessageType("error");
      return;
    }
    if (mode === "signup" && (!department || (department === "Other" && !customDepartment.trim()))) {
      setMessage("Choose your department, or enter its name if you select Other.");
      setMessageType("error");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setMessage(error.message);
          setMessageType("error");
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { department: department === "Other" ? customDepartment.trim() : department },
          },
        });
        if (error) {
          setMessage(error.message);
          setMessageType("error");
        } else if (!data.session) {
          setMessage("Account created. Check your email to confirm it, then sign in.");
          setMessageType("success");
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
          setDepartment("");
          setCustomDepartment("");
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not connect to the sign-in service.");
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setDepartment("");
    setCustomDepartment("");
  }

  return <main className="auth-screen">
    <section className="auth-card">
      <div className="auth-brand"><span><Leaf /></span><b>CARB<span>engine</span></b></div>
      <div className="auth-icon"><ShieldCheck /></div>
      <p className="auth-eyebrow">CAMPUS SUSTAINABILITY PLATFORM</p>
      <h1>{mode === "signin" ? "Sign in to CARBengine" : "Create your account"}</h1>
      <p className="auth-subtitle">{mode === "signin" ? "Sign in with your CARBengine account." : "Create an account to access the student dashboard."}</p>
      <form onSubmit={submit} className="auth-form">
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} required /></label>
        {mode === "signup" && <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label>}
        {mode === "signup" && <>
          <label>Department<select value={department} onChange={event => setDepartment(event.target.value)} required>
            <option value="" disabled>Select your department</option>
            {signupDepartments.map(option => <option key={option} value={option}>{option}</option>)}
          </select></label>
          {department === "Other" && <label>Department name<input type="text" value={customDepartment} onChange={event => setCustomDepartment(event.target.value)} maxLength={80} placeholder="Enter your department" required /></label>}
        </>}
        {message && <p className={`auth-message ${messageType}`} role={messageType === "error" ? "alert" : "status"}>{message}</p>}
        <button type="submit" disabled={busy}>{mode === "signin" ? <LogIn /> : <ShieldCheck />}{busy ? (mode === "signin" ? "Signing in…" : "Creating account…") : (mode === "signin" ? "Sign in" : "Create account")}</button>
      </form>
      <button className="auth-switch-button" type="button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")} disabled={busy}>
        {mode === "signin" ? "New to CARBengine? Create an account" : "Already have an account? Sign in"}
      </button>
      <p className="auth-footnote"><LockKeyhole /> New accounts start with student access. Choose a department during signup; an administrator can update your role.</p>
    </section>
  </main>;
}

function SetupMessage({ children }: { children: ReactNode }) {
  return <main className="auth-screen"><section className="auth-card auth-status-card"><div className="auth-brand"><span><Leaf /></span><b>CARB<span>engine</span></b></div><div className="auth-icon"><Activity /></div><h1>Sign-in setup needed</h1><p className="auth-subtitle">{children}</p></section></main>;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [modules, setModules] = useState<DashboardModule[]>([]);
  const [permissions, setPermissions] = useState<Record<string, AccessLevel>>({});
  const [profileLoading, setProfileLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [authError, setAuthError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    void withTimeout(supabase.auth.getSession(), "Checking your saved sign-in") .then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        setAuthError(error?.message || "");
        setAuthLoading(false);
      }
    }).catch(error => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : "Could not restore your sign-in. Please sign in again.");
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthError("");
      setAuthLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user.id) {
      setProfile(null);
      setModules([]);
      setPermissions({});
      setAccessError("");
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    setAccessError("");
    void (async () => {
      try {
        const { data: profileRow, error: profileError } = await withTimeout(
          supabase.from("user_profiles").select("user_id, role, active, department").eq("user_id", session.user.id).maybeSingle(),
          "Loading your account profile",
        );
        if (!active) return;
        if (profileError) {
          setAccessError(`Could not load your profile: ${profileError.message}`);
          setProfile(null);
          return;
        }
        if (!profileRow || !profileRow.active || !["admin", "student", "faculty", "technician"].includes(profileRow.role)) {
          setProfile(null);
          return;
        }
        setProfile(profileRow as UserProfile);
        const [moduleResult, permissionResult] = await withTimeout(Promise.all([
          supabase.from("dashboard_modules").select("module_key, label, enabled").order("label"),
          supabase.from("role_module_permissions").select("module_key, access_level").eq("role", profileRow.role),
        ]), "Loading dashboard permissions");
        if (!active) return;
        if (moduleResult.error) setAccessError(`Could not load dashboard modules: ${moduleResult.error.message}`);
        else setModules((moduleResult.data || []) as DashboardModule[]);
        if (permissionResult.error) {
          setAccessError(current => current || `Could not load role permissions: ${permissionResult.error.message}`);
          setPermissions({});
        } else {
          setPermissions(Object.fromEntries((permissionResult.data || []).map(row => [row.module_key, row.access_level as AccessLevel])));
        }
      } catch (error) {
        if (!active) return;
        setAccessError(error instanceof Error ? error.message : "Could not load your CARBengine access.");
        setProfile(null);
      } finally {
        if (active) setProfileLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session?.user.id, reloadVersion]);

  const canAccessModule = useCallback((moduleKey: string) => {
    if (!profile) return false;
    const module = modules.find(item => item.module_key === moduleKey);
    if (!module?.enabled) return false;
    if (profile.role === "admin") return true;
    return Boolean(permissions[moduleKey] && permissions[moduleKey] !== "none");
  }, [modules, permissions, profile]);

  const refreshAccess = useCallback(async () => {
    setReloadVersion(version => version + 1);
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const context = useMemo<AccessContextValue | null>(() => {
    if (!session?.user || !profile) return null;
    return {
      userId: session.user.id,
      email: session.user.email || "",
      profile,
      modules,
      permissions,
      accessError,
      canAccessModule,
      refreshAccess,
      signOut,
    };
  }, [session, profile, modules, permissions, accessError, canAccessModule, refreshAccess, signOut]);

  if (!supabaseConfigured) return <SetupMessage>Set your Supabase project URL and publishable key in <code>.env.local</code>, then restart the dashboard.</SetupMessage>;
  if (authLoading || (session && profileLoading)) return <main className="auth-screen"><section className="auth-card auth-status-card"><div className="auth-brand"><span><Leaf /></span><b>CARB<span>engine</span></b></div><div className="auth-spinner" /><p className="auth-subtitle">Loading your secure dashboard…</p></section></main>;
  if (!session) return <AuthScreen initialMessage={authError} />;
  if (!profile) return <main className="auth-screen"><section className="auth-card auth-status-card"><div className="auth-brand"><span><Leaf /></span><b>CARB<span>engine</span></b></div><div className="auth-icon"><ShieldCheck /></div><h1>{accessError ? "Could not load account access" : "Account access pending"}</h1><p className="auth-subtitle">{accessError || "Your account does not have an active CARBengine role yet. Ask an administrator to add your profile."}</p>{accessError && <button className="auth-secondary-button" onClick={() => void refreshAccess()}><Activity />Try again</button>}<button className="auth-secondary-button" onClick={() => void signOut()}><LogOut />Sign out</button></section></main>;

  return <AccessContext.Provider value={context!}>{children}</AccessContext.Provider>;
}
