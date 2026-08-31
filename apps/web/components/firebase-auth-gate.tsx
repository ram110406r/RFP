"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
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
        lastLoginAt: data.lastLoginAt ?? null,
      });
    });

    return () => unsubscribe();
  }, [user]);

  const heading = useMemo(() => {
    if (!isFirebaseConfigured()) return "Firebase configuration missing";
    return user ? `Signed in as ${maskEmail(user.email)}` : "Sign in with Firebase";
  }, [user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const credentials =
        mode === "register"
          ? await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
          : await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#ffffff_55%,_#f8fafc_100%)] px-6">
        <div className="rounded-[10px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
          Initializing Firebase session...
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
    return (
      <AuthShell
        heading={heading}
        description="Sign in with email/password or your Google account."
      >
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
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none ring-0 transition focus:border-sky-300 focus:bg-white"
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
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none ring-0 transition focus:border-sky-300 focus:bg-white"
              placeholder="********"
              required
              minLength={6}
            />
          </div>

          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center rounded-2xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Working..." : mode === "register" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "register" ? "sign-in" : "register")}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              {mode === "register" ? "Switch to sign in" : "Create a Firebase account"}
            </button>
          </div>
          <div className="relative py-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <span className="relative z-10 bg-white px-3">or</span>
            <span className="absolute inset-x-0 top-1/2 border-t border-slate-200" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={busy}
            className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-base font-bold text-blue-600" aria-hidden="true">G</span>
            Continue with Google
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
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f3f6fb_100%)] text-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <OnboardingRedirect>{children}</OnboardingRedirect>
        </div>
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
    if (status.data.needsOnboarding && !onOnboarding) router.replace("/onboarding");
    if (!status.data.needsOnboarding && onOnboarding) router.replace("/");
  }, [pathname, router, status.data, status.isError, status.isLoading]);
  if (status.isLoading && pathname !== "/onboarding") return <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Checking workspace setup...</div>;
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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#ffffff_55%,_#f8fafc_100%)] px-4 py-10">
      <div className="w-full max-w-md rounded-[12px] border border-slate-200 bg-white/95 p-6 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
        <div className="mb-6">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#155EEF] text-lg font-semibold text-white">
            T
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">TENDYY</p>
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
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Firebase env vars are missing. Set `NEXT_PUBLIC_FIREBASE_*` in `.env` and restart the app.
      </p>
      <p className="text-sm leading-6 text-slate-600">
        The repo now has the `tendyy` Firebase project registered, but the web app still needs the Firebase public config values
        available to the Next.js runtime.
      </p>
    </div>
  );
}
