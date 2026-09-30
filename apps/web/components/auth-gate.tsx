"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  ApiError,
  fetchCurrentProfile,
  fetchOnboardingStatus,
  getApiBaseUrl,
  type CurrentProfile,
} from "../lib/api";

function maskEmail(email: string | null) {
  if (!email) return "signed-in user";
  const [local = "", domain] = email.split("@");
  if (!domain || local.length < 3) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

export type AuthUserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  role?: string | null;
  organizationName?: string | null;
  preferredName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  timezone?: string | null;
  phone?: string | null;
  location?: string | null;
  language?: string | null;
  bio?: string | null;
  skills?: string[];
  notificationPreferences?: Record<string, boolean> | null;
  lastLoginAt?: unknown;
};

type BetterAuthUser = {
  uid: string;
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  metadata: { lastSignInTime?: string | null };
  providerData: Array<{ providerId: string; displayName?: string | null; email?: string | null }>;
};

type AuthSessionState = {
  user: BetterAuthUser | null;
  profile: AuthUserProfile | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionState | null>(null);

export function useAuthSession() {
  return useContext(AuthSessionContext);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const allowGuestUi = process.env.NEXT_PUBLIC_ALLOW_GUEST_UI === "true";
  if (allowGuestUi) return <>{children}</>;
  return <AuthGateInner>{children}</AuthGateInner>;
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();

  const sessionUser = useMemo(() => (profile ? toSessionUser(profile) : null), [profile]);
  const sessionProfile = useMemo(() => (profile ? toSessionProfile(profile) : null), [profile]);

  useEffect(() => {
    if (pathname === "/signup") setMode("register");
    if (pathname === "/login" || pathname === "/onboarding") setMode("sign-in");
  }, [pathname]);

  async function refreshProfile() {
    try {
      const nextProfile = await fetchCurrentProfile();
      setProfile(nextProfile);
      setError(null);
    } catch (authError) {
      if (authError instanceof ApiError && authError.status === 401) {
        setProfile(null);
        setError(null);
        return;
      }
      setError(authError instanceof Error ? authError.message : "Could not load your session.");
    }
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const nextProfile = await fetchCurrentProfile();
        if (!mounted) return;
        setProfile(nextProfile);
        setError(null);
      } catch (authError) {
        if (!mounted) return;
        if (authError instanceof ApiError && authError.status === 401) {
          setProfile(null);
          setError(null);
        } else {
          setError(authError instanceof Error ? authError.message : "Could not load your session.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const heading = useMemo(() => {
    if (sessionUser) return `Signed in as ${maskEmail(sessionUser.email)}`;
    if (pathname === "/signup") return "Create your company workspace";
    if (pathname === "/join") return mode === "register" ? "Create your employee account" : "Sign in to join your workspace";
    return mode === "register" ? "Create your TENDYY account" : "Sign in to TENDYY";
  }, [mode, pathname, sessionUser]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const endpoint = mode === "register" ? "/sign-up/email" : "/sign-in/email";
      const payload =
        mode === "register"
          ? { email: email.trim(), password, name: email.trim().split("@")[0] || "TENDYY user" }
          : { email: email.trim(), password, rememberMe: true };
      await betterAuthRequest(endpoint, payload);
      await refreshProfile();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      await betterAuthRequest("/sign-out", {});
      setProfile(null);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);

    try {
      const result = await betterAuthRequest<{ url?: string; redirectURL?: string }>("/sign-in/social", {
        provider: "google",
        callbackURL: window.location.href,
      });
      const target = result.url ?? result.redirectURL;
      if (target) {
        window.location.assign(target);
        return;
      }
      await refreshProfile();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-deep)] px-6">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-5 py-4 text-sm text-[var(--muted)] shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#155EEF]" aria-hidden="true" />
            <span>Loading your secure workspace...</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Preparing your session and checking onboarding status.
          </p>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    const isRegister = mode === "register";
    return (
      <AuthShell
        heading={heading}
        description={pathname === "/signup" ? "Create the first account for your company. You will set up the organization and its first workspace next." : pathname === "/join" ? "Use the exact email address that received the workspace invitation." : isRegister ? "Create a company account, or create your account with the email from an employee invitation." : "Sign in as a company owner or an invited employee to continue into TENDYY."}
      >
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
          <button type="button" onClick={() => setMode("sign-in")} className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm font-semibold transition-colors ${!isRegister ? "bg-white text-[var(--text)] shadow-[var(--shadow-subtle)]" : "text-[var(--muted)] hover:text-[var(--text-soft)]"}`}>
            Sign in
          </button>
          <button type="button" onClick={() => setMode("register")} className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm font-semibold transition-colors ${isRegister ? "bg-white text-[var(--text)] shadow-[var(--shadow-subtle)]" : "text-[var(--muted)] hover:text-[var(--text-soft)]"}`}>
            Create account
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="auth-email">
              Email
            </label>
            <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-4 py-3 text-[var(--text)] outline-none ring-0 transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,239,0.1)]" placeholder="name@company.com" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="auth-password">
              Password
            </label>
            <input id="auth-password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-4 py-3 text-[var(--text)] outline-none ring-0 transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,239,0.1)]" placeholder="************" required minLength={12} />
          </div>

          {error ? <p className="rounded-[var(--radius-sm)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Working..." : isRegister ? "Create account" : "Sign in"}
            </button>
            <button type="button" onClick={() => setMode(mode === "register" ? "sign-in" : "register")} className="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)]">
              {isRegister ? "Already have an account? Sign in" : "New here? Create account"}
            </button>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            {pathname === "/signup"
              ? "Already invited to a workspace? Open the invitation link instead of creating a company."
              : isRegister
                ? "Joining an existing company? Use the email address from your invitation. Your workspace access will be assigned after you sign in."
                : "Employee invitation? Open the invitation link and sign in with the invited email address."}
          </p>
          <div className="relative py-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <span className="relative z-10 bg-white px-3">or continue with</span>
            <span className="absolute inset-x-0 top-1/2 border-t border-slate-200" aria-hidden="true" />
          </div>
          <button type="button" onClick={() => void handleGoogleSignIn()} disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60">
            <span className="text-base font-bold text-blue-600" aria-hidden="true">G</span>
            {isRegister ? "Create with Google" : "Continue with Google"}
          </button>
        </form>
      </AuthShell>
    );
  }

  const session = {
    user: sessionUser,
    profile: sessionProfile,
    loading,
    busy,
    error,
    signOut: handleSignOut,
    refresh: refreshProfile,
  } satisfies AuthSessionState;

  return (
    <AuthSessionContext.Provider value={session}>
      <div className="min-h-screen min-w-0 max-w-full bg-[var(--bg-deep)] text-slate-900">
        {error ? (
          <div className="tendyy-wrap-anywhere relative z-[60] mx-3 mt-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-4">
            {error}
          </div>
        ) : null}
        <OnboardingRedirect>{children}</OnboardingRedirect>
      </div>
    </AuthSessionContext.Provider>
  );
}

function OnboardingRedirect({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useQuery({ queryKey: ["onboarding", "status"], queryFn: () => fetchOnboardingStatus() });
  useEffect(() => {
    if (status.isLoading || status.isError || !status.data) return;
    const onOnboarding = pathname === "/onboarding";
    const onJoin = pathname === "/join";
    const onAccess = pathname === "/access";
    const onVerifyEmail = pathname === "/verify-email";
    if (onJoin) return;
    if (status.data.lifecycleState === "EMAIL_VERIFICATION_REQUIRED") {
      if (!onVerifyEmail) router.replace("/verify-email");
      return;
    }
    if (status.data.lifecycleState === "PENDING_INVITATION") {
      if (!onJoin) router.replace("/join");
      return;
    }
    if (status.data.lifecycleState === "COMPANY_SETUP_REQUIRED" || status.data.lifecycleState === "PROFILE_REQUIRED") {
      if (!onOnboarding) router.replace("/onboarding");
      return;
    }
    if (status.data.lifecycleState === "NO_WORKSPACE_ACCESS") {
      if (!onAccess) router.replace("/access");
      return;
    }
    if (status.data.lifecycleState === "ACTIVE_MEMBER" && onOnboarding) router.replace("/");
    if (status.data.lifecycleState === "ACTIVE_MEMBER" && (onAccess || onVerifyEmail)) router.replace("/");
  }, [pathname, router, status.data, status.isError, status.isLoading]);
  if (status.isLoading && pathname !== "/onboarding" && pathname !== "/join") return <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Checking your workspace and onboarding status...</div>;
  return <>{children}</>;
}

function AuthShell({
  heading,
  description,
  children,
}: {
  heading: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-deep)] px-4 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-card)]">
        <div className="mb-6">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] text-lg font-semibold text-white">
            T
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">TENDYY</p>
          <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-950">{heading}</h1>
          <p className="mt-2 text-[13px] leading-6 text-slate-600">{description}</p>
        </div>

        {children}
      </div>
    </div>
  );
}

async function betterAuthRequest<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const baseUrl = getApiBaseUrl().replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
  });

  if (response.redirected) {
    window.location.assign(response.url);
    return {} as T;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data as { message?: string; error?: { message?: string } } | null)?.error?.message ??
      (data as { message?: string } | null)?.message ??
      response.statusText ??
      "Authentication failed.";
    throw new Error(message);
  }

  return (data ?? {}) as T;
}

function toSessionUser(profile: CurrentProfile): BetterAuthUser {
  return {
    uid: profile.uid,
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName ?? profile.name,
    photoURL: profile.photoURL,
    emailVerified: profile.emailVerified,
    metadata: { lastSignInTime: profile.lastLoginAt },
    providerData: [
      { providerId: "password", displayName: profile.displayName, email: profile.email },
      ...(profile.image ? [{ providerId: "google.com", displayName: profile.displayName, email: profile.email }] : []),
    ],
  };
}

function toSessionProfile(profile: CurrentProfile): AuthUserProfile {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName ?? profile.name,
    photoURL: profile.photoURL,
    emailVerified: profile.emailVerified,
    role: profile.role,
    organizationName: profile.organizationName,
    preferredName: profile.preferredName,
    jobTitle: profile.jobTitle,
    department: profile.department,
    timezone: profile.timezone,
    phone: profile.phone,
    location: profile.location,
    language: profile.language,
    bio: profile.bio,
    skills: profile.skills,
    notificationPreferences: profile.notificationPreferences,
    lastLoginAt: profile.lastLoginAt,
  };
}
