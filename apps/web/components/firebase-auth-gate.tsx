"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  ensureFirebaseAuthPersistence,
  getFirebaseDb,
  getFirebaseAuth,
  isFirebaseConfigured,
  syncFirebaseUserProfile,
} from "../lib/firebase";
import { fetchOnboardingStatus } from "../lib/api";

function maskEmail(email: string | null) {
  if (!email) return "signed-in user";
  const [local = "", domain] = email.split("@");
  if (!domain || local.length < 3) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

export type FirebaseUserProfile = {
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

type FirebaseSessionState = {
  user: User | null;
  profile: FirebaseUserProfile | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  signOut: () => Promise<void>;
};

const FirebaseSessionContext = createContext<FirebaseSessionState | null>(null);

export function useFirebaseSession() {
  return useContext(FirebaseSessionContext);
}

export function FirebaseAuthGate({ children }: { children: React.ReactNode }) {
  const allowGuestUi = process.env.NEXT_PUBLIC_ALLOW_GUEST_UI === "true";
  if (allowGuestUi) {
    return <>{children}</>;
  }

  return <FirebaseAuthGateInner>{children}</FirebaseAuthGateInner>;
}

function FirebaseAuthGateInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<FirebaseUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/signup") setMode("register");
    if (pathname === "/login" || pathname === "/onboarding") setMode("sign-in");
  }, [pathname]);

  useEffect(() => {
    let unsubscribe = () => {};
    void (async () => {
      try {
        await ensureFirebaseAuthPersistence();
        const firebaseAuth = getFirebaseAuth();
        unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
          setUser(nextUser);
          setProfile(null);
          setLoading(false);
          setError(null);
          if (nextUser) {
            void syncFirebaseUserProfile(nextUser).catch((syncError) => {
              console.warn("[firebase] user profile sync failed", syncError);
            });
          }
        });
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : "Firebase failed to initialize.");
        setLoading(false);
      }
    })();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const profileRef = doc(getFirebaseDb(), "users", user.uid);
    const unsubscribe = onSnapshot(profileRef, (snapshot) => {
      if (!snapshot.exists()) {
        setProfile({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          emailVerified: user.emailVerified,
        });
        return;
      }

      const data = snapshot.data() as DocumentData;
      setProfile({
        uid: user.uid,
        email: typeof data.email === "string" ? data.email : user.email,
        displayName: typeof data.displayName === "string" ? data.displayName : user.displayName,
        photoURL: typeof data.photoURL === "string" ? data.photoURL : user.photoURL,
        emailVerified: typeof data.emailVerified === "boolean" ? data.emailVerified : user.emailVerified,
        role: typeof data.role === "string" ? data.role : null,
        organizationName: typeof data.organizationName === "string" ? data.organizationName : null,
        preferredName: typeof data.preferredName === "string" ? data.preferredName : null,
        jobTitle: typeof data.jobTitle === "string" ? data.jobTitle : null,
        department: typeof data.department === "string" ? data.department : null,
        timezone: typeof data.timezone === "string" ? data.timezone : null,
        phone: typeof data.phone === "string" ? data.phone : null,
        location: typeof data.location === "string" ? data.location : null,
        language: typeof data.language === "string" ? data.language : null,
        bio: typeof data.bio === "string" ? data.bio : null,
        skills: Array.isArray(data.skills) ? data.skills.filter((value): value is string => typeof value === "string") : undefined,
        notificationPreferences:
          data.notificationPreferences && typeof data.notificationPreferences === "object"
            ? Object.fromEntries(
                Object.entries(data.notificationPreferences as Record<string, unknown>).filter(
                  (entry): entry is [string, boolean] => typeof entry[0] === "string" && typeof entry[1] === "boolean",
                ),
              )
            : null,
        lastLoginAt: data.lastLoginAt ?? null,
      });
    });

    return () => unsubscribe();
  }, [user]);

  const heading = useMemo(() => {
    if (!isFirebaseConfigured()) return "Firebase configuration missing";
    if (user) return `Signed in as ${maskEmail(user.email)}`;
    if (pathname === "/signup") return "Create your company workspace";
    if (pathname === "/join") return mode === "register" ? "Create your employee account" : "Sign in to join your workspace";
    return mode === "register" ? "Create your TENDYY account" : "Sign in to TENDYY";
  }, [mode, pathname, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const credentials =
        mode === "register"
          ? await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
          : await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);

      if (mode === "register" && !credentials.user.emailVerified) {
        await sendEmailVerification(credentials.user);
      }
      setUser(credentials.user);
      await syncFirebaseUserProfile(credentials.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Firebase sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOut(getFirebaseAuth());
      setUser(null);
      setProfile(null);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Firebase sign-out failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);

    try {
      const credentials = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      setUser(credentials.user);
      await syncFirebaseUserProfile(credentials.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!user) return;
    setVerificationBusy(true);
    setError(null);
    try {
      await sendEmailVerification(user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Could not send the verification email.");
    } finally {
      setVerificationBusy(false);
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

  if (!isFirebaseConfigured()) {
    return (
      <AuthShell heading={heading} description="Set the Firebase environment variables before using the dashboard.">
        <ConfigNotice />
      </AuthShell>
    );
  }

  if (!user) {
    const isRegister = mode === "register";
    return (
      <AuthShell
        heading={heading}
        description={pathname === "/signup" ? "Create the first account for your company. You will set up the organization and its first workspace next." : pathname === "/join" ? "Use the exact email address that received the workspace invitation." : isRegister ? "Create a company account, or create your account with the email from an employee invitation." : "Sign in as a company owner or an invited employee to continue into TENDYY."}
      >
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
          <button
            type="button"
            onClick={() => setMode("sign-in")}
            className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm font-semibold transition-colors ${!isRegister ? "bg-white text-[var(--text)] shadow-[var(--shadow-subtle)]" : "text-[var(--muted)] hover:text-[var(--text-soft)]"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm font-semibold transition-colors ${isRegister ? "bg-white text-[var(--text)] shadow-[var(--shadow-subtle)]" : "text-[var(--muted)] hover:text-[var(--text-soft)]"}`}
          >
            Create account
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="firebase-email">
              Email
            </label>
            <input
              id="firebase-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-4 py-3 text-[var(--text)] outline-none ring-0 transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,239,0.1)]"
              placeholder="name@company.com"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="firebase-password">
              Password
            </label>
            <input
              id="firebase-password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-4 py-3 text-[var(--text)] outline-none ring-0 transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,239,0.1)]"
              placeholder="********"
              required
              minLength={6}
            />
          </div>

          {error ? (
            <p className="rounded-[var(--radius-sm)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Working..." : isRegister ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "register" ? "sign-in" : "register")}
              className="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)]"
            >
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
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={busy}
            className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-base font-bold text-blue-600" aria-hidden="true">G</span>
            {isRegister ? "Create with Google" : "Continue with Google"}
          </button>
        </form>
      </AuthShell>
    );
  }

  const session = {
    user,
    profile,
    loading,
    busy,
    error,
    signOut: handleSignOut,
  } satisfies FirebaseSessionState;

  return (
    <FirebaseSessionContext.Provider value={session}>
      <div className="min-h-screen min-w-0 max-w-full bg-[var(--bg-deep)] text-slate-900">
          {error ? (
            <div className="tendyy-wrap-anywhere relative z-[60] mx-3 mt-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-4">
              {error}
            </div>
          ) : null}
          {!user.emailVerified ? (
            <div className="relative z-[60] mx-3 mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-4">
              <span className="tendyy-wrap-anywhere min-w-0">Verify {user.email ?? "your email"} before creating a company, accepting an invitation, or opening company data.</span>
              <button type="button" disabled={verificationBusy} onClick={() => void resendVerification()} className="font-semibold text-amber-900 underline disabled:opacity-60">
                {verificationBusy ? "Sending..." : "Resend email"}
              </button>
            </div>
          ) : null}
          <OnboardingRedirect>{children}</OnboardingRedirect>
      </div>
    </FirebaseSessionContext.Provider>
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

function ConfigNotice() {
  return (
    <div className="space-y-3">
      <p className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Firebase environment variables are missing. Set `NEXT_PUBLIC_FIREBASE_*` in `.env` and restart the app.
      </p>
      <p className="text-sm leading-6 text-slate-600">
        The app still needs the Firebase public config values at runtime before sign-in and onboarding can work.
      </p>
    </div>
  );
}
