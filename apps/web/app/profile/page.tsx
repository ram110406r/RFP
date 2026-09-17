"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery } from "@tanstack/react-query";
import { updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Copy,
  Laptop2,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { TendyyResponsiveNav } from "../../components/tendyy-ui";
import { useFirebaseSession } from "../../components/firebase-auth-gate";
import { fetchOnboardingStatus } from "../../lib/api";
import { getFirebaseAuth, getFirebaseDb } from "../../lib/firebase";
import { useActivities, useOrganizationCurrent, useOrganizationMembers } from "../../lib/queries";
import { Button } from "@rfp-os/ui";

type ProfileTab = "overview" | "preferences" | "security" | "sessions" | "api-keys" | "activity";

type PersonalForm = {
  displayName: string;
  preferredName: string;
  jobTitle: string;
  department: string;
  timezone: string;
  phone: string;
  location: string;
  language: string;
  bio: string;
};

type NotificationForm = {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  deadlineAlerts: boolean;
  weeklyDigest: boolean;
  marketingUpdates: boolean;
};

type AccountSummaryRow = {
  label: string;
  value: string;
  tone?: "success" | "neutral";
  copyable?: boolean;
};

const tabs: Array<{ id: ProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "preferences", label: "Preferences" },
  { id: "security", label: "Security" },
  { id: "sessions", label: "Sessions" },
  { id: "api-keys", label: "API Keys" },
  { id: "activity", label: "Activity" },
];

const JOB_TITLE_OPTIONS = [
  "founder",
  "executive",
  "proposal_manager",
  "bid_manager",
  "solutions_architect",
  "sales_manager",
  "security_manager",
  "legal_counsel",
  "product_manager",
  "engineer",
  "analyst",
  "other",
];

const DEPARTMENT_OPTIONS = [
  "executive",
  "sales",
  "presales",
  "bid_management",
  "engineering",
  "product",
  "security",
  "legal",
  "finance",
  "operations",
  "other",
];

export default function ProfilePage() {
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Profile" }]} hideDesktopHeader>
      <ProfileWorkspace />
    </AppShell>
  );
}

function ProfileWorkspace() {
  const session = useFirebaseSession();
  const user = session?.user ?? null;
  const profile = session?.profile ?? null;
  const onboardingQuery = useQuery({
    queryKey: ["onboarding", "status"],
    queryFn: () => fetchOnboardingStatus(),
    enabled: Boolean(user),
  });
  const organizationQuery = useOrganizationCurrent();
  const membersQuery = useOrganizationMembers();
  // Firebase UIDs are not the API's canonical database user UUIDs.
  const activitiesQuery = useActivities({ actorId: user ? "me" : undefined });
  const organization = organizationQuery.data ?? null;
  const members = useMemo(() => membersQuery.data?.members ?? [], [membersQuery.data?.members]);
  const activityItems = activitiesQuery.data?.items ?? [];
  const onboarding = onboardingQuery.data ?? null;
  const currentMember = members.find((member) => member.userId === user?.uid) ?? null;

  const profileSource = useMemo(
    () =>
      buildProfileSource({
        user,
        profile,
        onboardingUser: onboarding?.user ?? null,
        organizationName: organization?.name ?? null,
        organization,
        member: currentMember,
      }),
    [currentMember, onboarding?.user, organization, profile, user],
  );

  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [personalEditing, setPersonalEditing] = useState(false);
  const [preferencesEditing, setPreferencesEditing] = useState(false);
  const [skillsEditing, setSkillsEditing] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [personalDraft, setPersonalDraft] = useState<PersonalForm>(profileSource.personal);
  const [preferencesDraft, setPreferencesDraft] = useState<NotificationForm>(profileSource.preferences);
  const [skillsDraft, setSkillsDraft] = useState(profileSource.skills.join(", "));

  const saveProfileMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!user) throw new Error("No authenticated user available.");
      const auth = getFirebaseAuth();
      if (patch.displayName && auth.currentUser && typeof patch.displayName === "string" && auth.currentUser.displayName !== patch.displayName) {
        await updateProfile(auth.currentUser, { displayName: patch.displayName });
      }

      await setDoc(
        doc(getFirebaseDb(), "users", user.uid),
        {
          ...patch,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    },
  });

  useEffect(() => {
    if (!personalEditing) {
      setPersonalDraft(profileSource.personal);
      setPersonalError(null);
    }
  }, [personalEditing, profileSource.personal]);

  useEffect(() => {
    if (!preferencesEditing) {
      setPreferencesDraft(profileSource.preferences);
      setPreferencesError(null);
    }
  }, [preferencesEditing, profileSource.preferences]);

  useEffect(() => {
    if (!skillsEditing) {
      setSkillsDraft(profileSource.skills.join(", "));
      setSkillsError(null);
    }
  }, [skillsEditing, profileSource.skills]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const recentActivities = activityItems.slice(0, 5);
  const recentActivityCount = recentActivities.length;
  const linkedProviders = useMemo(() => buildConnectedAccounts(user?.providerData ?? []), [user?.providerData]);
  const reportingTo = useMemo(() => {
    if (!user) return "Not set";
    const supervisor =
      members.find((member) => member.userId !== user.uid && (member.role === "OWNER" || member.role === "ADMIN")) ??
      members.find((member) => member.userId !== user.uid) ??
      null;
    if (!supervisor) return "Self-managed";
    return `${supervisor.name} (${formatRole(supervisor.role)})`;
  }, [members, user]);

  const activeMember = currentMember?.status ?? "active";
  const workspaceName = organization?.name ?? profile?.organizationName ?? onboarding?.membership?.organizationName ?? "TENDYY organization";
  const roleLabel = profile?.role ?? onboarding?.membership?.role ?? currentMember?.role ?? "Workspace member";
  const joinedLabel = currentMember?.joinedAt ?? null;
  const email = profile?.email ?? user?.email ?? onboarding?.user.email ?? "Not set";
  const emailVerified = profile?.emailVerified ?? user?.emailVerified ?? false;
  const lastLogin = profile?.lastLoginAt ?? user?.metadata.lastSignInTime ?? null;
  const mfaEnabled = Boolean((user as (typeof user & { multiFactor?: { enrolledFactors?: unknown[] } }) | null)?.multiFactor?.enrolledFactors?.length);
  const avatarLabel = initials(profileSource.personal.displayName || user?.displayName || email);
  const accountSummaryRows: AccountSummaryRow[] = [
    { label: "User ID", value: user?.uid ?? onboarding?.user.id ?? "Not available", copyable: true },
    { label: "Workspace", value: workspaceName },
    { label: "Role", value: formatRole(roleLabel) },
    { label: "Last login", value: formatDateTime(lastLogin) },
    { label: "MFA status", value: mfaEnabled ? "Enabled" : "Not configured", tone: mfaEnabled ? "success" : "neutral" },
    { label: "Reporting to", value: reportingTo },
  ] as const;

  return (
    <div className="min-w-0 space-y-3 pb-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-[29px] font-semibold tracking-tight text-slate-950 sm:text-[32px]">Profile</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            Manage your personal information, preferences, and account settings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary">
            <Link href="/settings">
              <CircleHelp className="h-4 w-4" />
              Help & Support
            </Link>
          </Button>

          <button
            type="button"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700 shadow-sm"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {recentActivityCount > 0 ? (
              <span className="absolute right-2 top-1.5 h-2.5 min-w-2.5 rounded-full bg-[#155EEF] px-0.5 text-[9px] leading-4 text-white">
                {Math.min(9, recentActivityCount)}
              </span>
            ) : null}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-[#155EEF]"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar size="sm" initials={avatarLabel} photoURL={profile?.photoURL ?? user?.photoURL ?? null} />
              <span className="hidden sm:block">
                <span className="block text-[13px] font-semibold text-slate-950">{profileSource.personal.displayName}</span>
                <span className="block text-[11px] text-slate-500">{formatRole(roleLabel)}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-12 z-30 w-56 rounded-[10px] border border-slate-200 bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  <Settings className="h-4 w-4 text-slate-400" />
                  Account settings
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    await session?.signOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  <LogOut className="h-4 w-4 text-slate-400" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <TendyyResponsiveNav label="Profile section" value={activeTab} items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))} onChange={(value) => { const tab = value as ProfileTab; setActiveTab(tab); jumpTo(tab === "preferences" ? "preferences" : tab); }} />

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.72fr)_minmax(0,0.82fr)]">
        <main className="min-w-0 space-y-3">
          <section id="overview" className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 gap-3">
                <div className="relative">
                  <Avatar size="lg" initials={avatarLabel} photoURL={profile?.photoURL ?? user?.photoURL ?? null} />
                  <button
                    type="button"
                    onClick={() => {
                      setPersonalEditing(true);
                      setActiveTab("preferences");
                      jumpTo("preferences");
                    }}
                    className="absolute -right-1 bottom-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                    aria-label="Edit profile photo"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[24px] font-semibold tracking-tight text-slate-950">{profileSource.personal.displayName}</h2>
                    <Badge tone={activeMember === "active" ? "success" : "neutral"}>{formatStatus(activeMember)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{formatRole(profileSource.personal.jobTitle || roleLabel)}</Badge>
                    <Badge tone="neutral">{formatRole(roleLabel)}</Badge>
                  </div>
                  <div className="mt-3.5 grid gap-3 text-[13px] text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
                    <IdentityRow icon={<Mail className="h-4 w-4" />} value={email} />
                    <IdentityRow icon={<Phone className="h-4 w-4" />} value={profileSource.personal.phone || "Not set"} />
                    <IdentityRow icon={<MapPin className="h-4 w-4" />} value={profileSource.personal.location || "Not set"} />
                    <IdentityRow icon={<CalendarDays className="h-4 w-4" />} value={formatDateTime(joinedLabel)} />
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild variant="secondary">
                  <Link href="/organization">
                    View organization
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          <section id="preferences" className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <SectionHeader
              eyebrow="Personal Information"
              title="Personal information"
              description="Read-only by default, with compact editing for the fields this app already stores."
              actionLabel={personalEditing ? "Editing" : "Edit"}
              actionHref={undefined}
              onAction={() => setPersonalEditing((current) => !current)}
              actionIcon={<Pencil className="h-4 w-4" />}
            />

            {personalEditing ? (
              <form
                className="mt-3 space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const result = validatePersonalForm(personalDraft);
                  if (!result.ok) {
                    setPersonalError(result.error);
                    return;
                  }

                  setPersonalError(null);
                  await saveProfileMutation.mutateAsync({
                    displayName: personalDraft.displayName.trim(),
                    preferredName: personalDraft.preferredName.trim(),
                    jobTitle: personalDraft.jobTitle,
                    department: personalDraft.department,
                    timezone: personalDraft.timezone.trim(),
                    phone: personalDraft.phone.trim(),
                    location: personalDraft.location.trim(),
                    language: personalDraft.language.trim(),
                    bio: personalDraft.bio.trim(),
                  });
                  setPersonalEditing(false);
                }}
              >
                {personalError ? (
                  <p className="rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                    {personalError}
                  </p>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Full name">
                    <Input value={personalDraft.displayName} onChange={(value) => setPersonalDraft({ ...personalDraft, displayName: value })} />
                  </Field>
                  <Field label="Preferred name">
                    <Input value={personalDraft.preferredName} onChange={(value) => setPersonalDraft({ ...personalDraft, preferredName: value })} />
                  </Field>
                  <Field label="Email address">
                    <ReadOnly value={email} />
                  </Field>
                  <Field label="Phone number">
                    <Input value={personalDraft.phone} onChange={(value) => setPersonalDraft({ ...personalDraft, phone: value })} />
                  </Field>
                  <Field label="Job title">
                    <Select value={personalDraft.jobTitle} options={JOB_TITLE_OPTIONS} onChange={(value) => setPersonalDraft({ ...personalDraft, jobTitle: value })} />
                  </Field>
                  <Field label="Department">
                    <Select value={personalDraft.department} options={DEPARTMENT_OPTIONS} onChange={(value) => setPersonalDraft({ ...personalDraft, department: value })} />
                  </Field>
                  <Field label="Location">
                    <Input value={personalDraft.location} onChange={(value) => setPersonalDraft({ ...personalDraft, location: value })} />
                  </Field>
                  <Field label="Timezone">
                    <Input value={personalDraft.timezone} onChange={(value) => setPersonalDraft({ ...personalDraft, timezone: value })} />
                  </Field>
                  <Field label="Language">
                    <Input value={personalDraft.language} onChange={(value) => setPersonalDraft({ ...personalDraft, language: value })} />
                  </Field>
                  <Field label="Bio" className="md:col-span-2">
                    <Textarea value={personalDraft.bio} onChange={(value) => setPersonalDraft({ ...personalDraft, bio: value })} />
                  </Field>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (hasPersonalChanges(personalDraft, profileSource.personal) && !window.confirm("Discard unsaved personal information changes?")) {
                        return;
                      }
                      setPersonalEditing(false);
                      setPersonalDraft(profileSource.personal);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveProfileMutation.isPending}
                  >
                    {saveProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-4 grid gap-0 md:grid-cols-2">
                <InfoList label="Full name" value={profileSource.personal.displayName} />
                <InfoList label="Preferred name" value={profileSource.personal.preferredName || "Not set"} />
                <InfoList label="Email address" value={email} />
                <InfoList label="Phone number" value={profileSource.personal.phone || "Not set"} />
                <InfoList label="Job title" value={formatRole(profileSource.personal.jobTitle || "Not set")} />
                <InfoList label="Department" value={formatRole(profileSource.personal.department || "Not set")} />
                <InfoList label="Location" value={profileSource.personal.location || "Not set"} />
                <InfoList label="Timezone" value={profileSource.personal.timezone || "Not set"} />
                <InfoList label="Language" value={profileSource.personal.language || "Not set"} />
                <InfoList label="Bio" value={profileSource.personal.bio || "Not provided"} full />
              </div>
            )}
          </section>

          <section id="activity" className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <SectionHeader
              eyebrow="Recent Activity"
              title="Recent activity"
              description="Your latest actions across the workspace."
              actionLabel="View all"
              actionHref="/organization#audits"
            />

            <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
              {activitiesQuery.isError ? (
                <div className="p-3.5">
                  <EmptyCopy title="Activity feed unavailable" description="We couldn't load your recent actions." />
                </div>
              ) : recentActivities.length > 0 ? (
                <>
                <div className="hidden xl:block">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <Th>Action</Th>
                        <Th>Details</Th>
                        <Th>Time</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentActivities.map((item) => (
                        <tr key={item.id} className="bg-white align-top">
                          <Td>
                            <div className="flex items-center gap-3 py-3">
                              <ActivityBadge label={item.kind} />
                              <span className="text-[13px] font-medium text-slate-950">{item.summary || item.label}</span>
                            </div>
                          </Td>
                          <Td>
                            <div className="py-3 text-[13px] text-slate-700">{item.label}</div>
                          </Td>
                          <Td>
                            <div className="py-3 text-[13px] text-slate-600">{relativeTime(item.createdAt)}</div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-slate-200 xl:hidden">{recentActivities.map((item) => <article key={item.id} className="min-w-0 p-3"><div className="flex min-w-0 items-start gap-3"><ActivityBadge label={item.kind} /><div className="min-w-0 flex-1"><p className="tendyy-wrap-anywhere text-[13px] font-medium text-slate-950">{item.summary || item.label}</p><p className="tendyy-wrap-anywhere mt-1 text-xs text-slate-600">{item.label}</p><p className="mt-2 text-xs text-slate-500">{relativeTime(item.createdAt)}</p></div></div></article>)}</div>
                </>
              ) : (
                <div className="p-3.5">
                  <EmptyCopy title="No recent activity" description="Your activity timeline will appear here once you start working in the workspace." />
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-3">
          <section id="security" className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <SectionHeader eyebrow="Account Summary" title="Account summary" />
            <div className="mt-4 space-y-3">
              {accountSummaryRows.map((row) => (
                <SummaryRow key={row.label} label={row.label} value={row.value} tone={row.tone} copyable={row.copyable} />
              ))}
            </div>
          </section>

          <section className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <SectionHeader
              eyebrow="Skills & Expertise"
              title="Skills & expertise"
              description="Derived from your role and the profile data already in the app."
              actionLabel={skillsEditing ? "Editing" : "Edit"}
              onAction={() => setSkillsEditing((current) => !current)}
              actionIcon={<Pencil className="h-4 w-4" />}
            />

            {skillsEditing ? (
              <div className="mt-4 space-y-3">
                {skillsError ? (
                  <p className="rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{skillsError}</p>
                ) : null}
                <Field label="Skills">
                  <Textarea
                    value={skillsDraft}
                    onChange={(value) => setSkillsDraft(value)}
                    placeholder="RFP Management, Bid Strategy, Solutioning"
                  />
                </Field>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (hasSkillsChanges(skillsDraft, profileSource.skills.join(", ")) && !window.confirm("Discard unsaved skill changes?")) {
                        return;
                      }
                      setSkillsEditing(false);
                      setSkillsDraft(profileSource.skills.join(", "));
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={saveProfileMutation.isPending}
                    onClick={async () => {
                      const nextSkills = parseSkills(skillsDraft);
                      if (nextSkills.length === 0) {
                        setSkillsError("Add at least one skill.");
                        return;
                      }
                      setSkillsError(null);
                      await saveProfileMutation.mutateAsync({ skills: nextSkills });
                      setSkillsEditing(false);
                    }}
                  >
                    {saveProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {profileSource.skills.map((skill) => (
                  <SkillTag key={skill}>{skill}</SkillTag>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <SectionHeader
              eyebrow="Notification Preferences"
              title="Notification preferences"
              description="Read-only until you choose to adjust them."
              actionLabel={preferencesEditing ? "Editing" : "Edit"}
              onAction={() => setPreferencesEditing((current) => !current)}
              actionIcon={<Pencil className="h-4 w-4" />}
            />

            {preferencesEditing ? (
              <div className="mt-4 space-y-3">
                {preferencesError ? (
                  <p className="rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{preferencesError}</p>
                ) : null}
                <SwitchRow
                  label="Email notifications"
                  description="Receive email alerts for important workspace updates."
                  checked={preferencesDraft.emailNotifications}
                  onChange={(checked) => setPreferencesDraft({ ...preferencesDraft, emailNotifications: checked })}
                />
                <SwitchRow
                  label="In-app notifications"
                  description="Show alerts inside TENDYY when you are active."
                  checked={preferencesDraft.inAppNotifications}
                  onChange={(checked) => setPreferencesDraft({ ...preferencesDraft, inAppNotifications: checked })}
                />
                <SwitchRow
                  label="Deadline alerts"
                  description="Highlight approaching tender and response deadlines."
                  checked={preferencesDraft.deadlineAlerts}
                  onChange={(checked) => setPreferencesDraft({ ...preferencesDraft, deadlineAlerts: checked })}
                />
                <SwitchRow
                  label="Weekly digest"
                  description="Send a compact summary of your recent activity."
                  checked={preferencesDraft.weeklyDigest}
                  onChange={(checked) => setPreferencesDraft({ ...preferencesDraft, weeklyDigest: checked })}
                />
                <SwitchRow
                  label="Marketing & updates"
                  description="Product announcements and platform updates."
                  checked={preferencesDraft.marketingUpdates}
                  onChange={(checked) => setPreferencesDraft({ ...preferencesDraft, marketingUpdates: checked })}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (hasPreferenceChanges(preferencesDraft, profileSource.preferences) && !window.confirm("Discard unsaved preference changes?")) {
                        return;
                      }
                      setPreferencesEditing(false);
                      setPreferencesDraft(profileSource.preferences);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={saveProfileMutation.isPending}
                    onClick={async () => {
                      await saveProfileMutation.mutateAsync({ notificationPreferences: preferencesDraft });
                      setPreferencesEditing(false);
                    }}
                  >
                    {saveProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {Object.entries(profileSource.preferences).map(([label, value]) => (
                  <PreferenceRow key={label} label={preferenceLabel(label)} value={value ? "On" : "Off"} tone={value ? "success" : "neutral"} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <SectionHeader eyebrow="Connected Accounts" title="Connected accounts" />
            <div className="mt-4 space-y-2">
              {linkedProviders.length > 0 ? (
                linkedProviders.map((provider) => (
                  <ConnectedAccountRow key={provider.providerId} provider={provider} />
                ))
              ) : (
                <EmptyCopy title="No linked providers" description="This account currently only exposes the primary sign-in method." />
              )}
            </div>
          </section>

          <section id="sessions" className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <SectionHeader eyebrow="Sessions" title="Sessions" />
            <div className="mt-4 space-y-3">
              <SessionRow
                title="Current session"
                description={navigatorInfo()}
                value={formatDateTime(lastLogin)}
                icon={<Laptop2 className="h-4 w-4 text-[#155EEF]" />}
              />
              <SessionRow
                title="Authentication"
                description="Firebase browser session"
                value={emailVerified ? "Email verified" : "Email not verified"}
                icon={<ShieldCheck className="h-4 w-4 text-[#155EEF]" />}
              />
            </div>
          </section>

          <section id="api-keys" className="rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <SectionHeader eyebrow="API Keys" title="API keys" />
            <div className="mt-4 space-y-3">
              <EmptyCopy
                title="No personal API keys"
                description="TENDYY does not expose personal API keys from this profile yet."
              />
              <Button asChild variant="secondary">
                <Link href="/settings">
                  Open settings
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function buildProfileSource({
  user,
  profile,
  onboardingUser,
  organizationName,
  organization,
  member,
}: {
  user: ReturnType<typeof useFirebaseSession> extends infer T ? T extends { user: infer U } ? U | null : never : never;
  profile: ReturnType<typeof useFirebaseSession> extends infer T ? T extends { profile: infer P } ? P | null : never : never;
  onboardingUser: {
    id: string;
    name: string;
    email: string;
    preferredName: string;
    jobTitle: string;
    department: string;
    timezone: string;
    phone: string;
  } | null;
  organizationName: string | null;
  organization: { country?: string; operatingRegion?: string; profile?: Record<string, unknown> } | null;
  member: { role: string; status: string } | null;
}) {
  const displayName = profile?.displayName ?? onboardingUser?.name ?? user?.displayName ?? "Account profile";
  const preferredName = profile?.preferredName ?? onboardingUser?.preferredName ?? "";
  const jobTitle = profile?.jobTitle ?? onboardingUser?.jobTitle ?? "";
  const department = profile?.department ?? onboardingUser?.department ?? "";
  const timezone = profile?.timezone ?? onboardingUser?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const phone = profile?.phone ?? onboardingUser?.phone ?? "";
  const location =
    profile?.location ??
    [organization?.country, organization?.operatingRegion].filter(Boolean).join(", ") ??
    "";
  const language = profile?.language ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
  const bio = profile?.bio ?? "";
  const skills = profile?.skills?.length ? profile.skills : deriveSkills({ jobTitle, department, role: profile?.role ?? member?.role ?? null });
  const preferences = normalizeNotificationPreferences(
    profile?.notificationPreferences,
    buildNotificationDefaults({
      email: profile?.email ?? user?.email ?? onboardingUser?.email ?? "",
      recentActivityCount: 0,
      activeMember: member?.status ?? "active",
    }),
  );

  return {
    personal: {
      displayName,
      preferredName,
      jobTitle,
      department,
      timezone,
      phone,
      location,
      language,
      bio,
    } satisfies PersonalForm,
    preferences,
    skills,
    organizationName: organizationName ?? profile?.organizationName ?? onboardingUser?.name ?? "TENDYY organization",
  };
}

function validatePersonalForm(form: PersonalForm) {
  if (form.displayName.trim().length < 2) return { ok: false, error: "Full name should be at least 2 characters." } as const;
  if (!form.jobTitle.trim()) return { ok: false, error: "Select a job title." } as const;
  if (!form.department.trim()) return { ok: false, error: "Select a department." } as const;
  if (!form.timezone.trim()) return { ok: false, error: "Timezone is required." } as const;
  return { ok: true } as const;
}

function buildNotificationDefaults({
  email,
  recentActivityCount,
  activeMember,
}: {
  email: string;
  recentActivityCount: number;
  activeMember: string;
}): NotificationForm {
  return {
    emailNotifications: Boolean(email),
    inAppNotifications: activeMember === "active" || recentActivityCount > 0,
    deadlineAlerts: true,
    weeklyDigest: true,
    marketingUpdates: false,
  };
}

function normalizeNotificationPreferences(
  value: Record<string, boolean> | NotificationForm | null | undefined,
  fallback: NotificationForm,
): NotificationForm {
  if (!value) return fallback;
  return {
    emailNotifications: value.emailNotifications ?? fallback.emailNotifications,
    inAppNotifications: value.inAppNotifications ?? fallback.inAppNotifications,
    deadlineAlerts: value.deadlineAlerts ?? fallback.deadlineAlerts,
    weeklyDigest: value.weeklyDigest ?? fallback.weeklyDigest,
    marketingUpdates: value.marketingUpdates ?? fallback.marketingUpdates,
  };
}

function deriveSkills({
  jobTitle,
  department,
  role,
}: {
  jobTitle: string;
  department: string;
  role: string | null;
}) {
  const tokens = new Set<string>();
  for (const item of skillMap[jobTitle] ?? []) tokens.add(item);
  for (const item of departmentSkills[department] ?? []) tokens.add(item);
  for (const item of role ? roleSkills[role.toLowerCase()] ?? [] : []) tokens.add(item);
  if (tokens.size === 0) {
    tokens.add("RFP Management");
    tokens.add("Stakeholder Management");
    tokens.add("Technical Writing");
  }
  return [...tokens].slice(0, 8);
}

const skillMap: Record<string, string[]> = {
  founder: ["Leadership", "Strategy", "Stakeholder Management"],
  executive: ["Governance", "Commercial Review", "Decision Making"],
  proposal_manager: ["RFP Management", "Bid Strategy", "Solutioning"],
  bid_manager: ["Bid Strategy", "Compliance", "Proposal Planning"],
  solutions_architect: ["Technical Writing", "Solution Design", "Compliance"],
  sales_manager: ["Opportunity Management", "Stakeholder Management", "Commercial Review"],
  security_manager: ["Risk Assessment", "Security Review", "Compliance"],
  legal_counsel: ["Contract Review", "Compliance", "Risk Assessment"],
  product_manager: ["Roadmapping", "Documentation", "Stakeholder Management"],
  engineer: ["Implementation", "Solutioning", "Technical Writing"],
  analyst: ["Research", "Document Review", "Process Improvement"],
  other: ["RFP Management", "Cross-functional Coordination", "Documentation"],
};

const departmentSkills: Record<string, string[]> = {
  executive: ["Leadership", "Governance"],
  sales: ["Opportunity Management", "Commercial Review"],
  presales: ["Solutioning", "Bid Strategy"],
  bid_management: ["RFP Management", "Proposal Planning"],
  engineering: ["Implementation", "Technical Writing"],
  product: ["Roadmapping", "Documentation"],
  security: ["Risk Assessment", "Compliance"],
  legal: ["Contract Review", "Compliance"],
  finance: ["Commercial Review", "Process Control"],
  operations: ["Process Improvement", "Coordination"],
};

const roleSkills: Record<string, string[]> = {
  owner: ["Leadership", "Governance"],
  admin: ["Governance", "Cross-functional Coordination"],
  rfp_manager: ["RFP Management", "Bid Strategy"],
  contributor: ["Solutioning", "Technical Writing"],
  reviewer: ["Review", "Compliance"],
  sme: ["Subject Matter Expertise", "Risk Assessment"],
  viewer: ["Read Operations", "Document Review"],
};

function buildConnectedAccounts(providers: Array<{ providerId: string; displayName?: string | null; email?: string | null }>) {
  return providers
    .map((provider) => {
      const label = providerLabel(provider.providerId);
      if (!label) return null;
      return {
        providerId: provider.providerId,
        label,
        account: provider.email ?? provider.displayName ?? "Connected",
      };
    })
    .filter((value): value is { providerId: string; label: string; account: string } => Boolean(value));
}

function providerLabel(providerId: string) {
  if (providerId === "google.com") return "Google";
  if (providerId === "password") return "Email / Password";
  if (providerId === "phone") return "Phone";
  if (providerId === "github.com") return "GitHub";
  if (providerId === "microsoft.com") return "Microsoft";
  return providerId;
}

function hasPersonalChanges(current: PersonalForm, base: PersonalForm) {
  return JSON.stringify(current) !== JSON.stringify(base);
}

function hasSkillsChanges(current: string, base: string) {
  return current.trim() !== base.trim();
}

function hasPreferenceChanges(current: NotificationForm, base: NotificationForm) {
  return JSON.stringify(current) !== JSON.stringify(base);
}

function parseSkills(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function preferenceLabel(key: string) {
  if (key === "emailNotifications") return "Email notifications";
  if (key === "inAppNotifications") return "In-app notifications";
  if (key === "deadlineAlerts") return "Deadline alerts";
  if (key === "weeklyDigest") return "Weekly digest";
  if (key === "marketingUpdates") return "Marketing & updates";
  return key;
}

function navigatorInfo() {
  if (typeof navigator === "undefined") return "Current browser session";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "Browser";
  return `${platform} · ${navigator.language}`;
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "RA";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}

function formatRole(role: string) {
  return role
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatStatus(value: string) {
  return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const deltaMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function copyToClipboard(value: string) {
  void navigator.clipboard?.writeText(value);
}

function AccountSummaryTone({ tone, children }: { tone?: "success" | "neutral"; children: React.ReactNode }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}>{children}</span>;
}

function Avatar({
  size,
  initials,
  photoURL,
}: {
  size: "sm" | "lg";
  initials: string;
  photoURL: string | null;
}) {
  const classes =
    size === "lg"
      ? "h-20 w-20 rounded-[999px] text-[22px]"
      : "h-11 w-11 rounded-full text-[13px]";

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden bg-[#EFF5FF] font-semibold text-[#155EEF] ${classes}`}>
      {photoURL ? <Image src={photoURL} alt="" width={size === "lg" ? 80 : 44} height={size === "lg" ? 80 : 44} className="h-full w-full object-cover" /> : <span>{initials}</span>}
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "neutral"; children: React.ReactNode }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}>{children}</span>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-[8px] border border-slate-200 bg-white px-3 text-[13px] text-slate-950 outline-none transition focus:border-[#155EEF] focus:ring-2 focus:ring-[#155EEF]/15"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-[8px] border border-slate-200 bg-white px-3 text-[13px] text-slate-950 outline-none transition focus:border-[#155EEF] focus:ring-2 focus:ring-[#155EEF]/15"
    >
      <option value="">Select</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {formatRole(option)}
        </option>
      ))}
    </select>
  );
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={4}
      placeholder={placeholder}
      className="w-full rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none transition focus:border-[#155EEF] focus:ring-2 focus:ring-[#155EEF]/15"
    />
  );
}

function ReadOnly({ value }: { value: string }) {
  return <div className="flex h-10 items-center rounded-[8px] border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-700">{value}</div>;
}

function SummaryRow({
  label,
  value,
  tone,
  copyable = false,
}: {
  label: string;
  value: string;
  tone?: "success" | "neutral";
  copyable?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span className="text-[13px] text-slate-600">{label}</span>
      <span className="flex items-center gap-2 text-right">
        <AccountSummaryTone tone={tone}>{value}</AccountSummaryTone>
        {copyable ? (
          <button type="button" onClick={() => copyToClipboard(value)} className="text-slate-400 transition hover:text-slate-950" aria-label={`Copy ${label}`}>
            <Copy className="h-4 w-4" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function SkillTag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-[#D0D5DD] bg-[#EFF4FF] px-2.5 py-1 text-[11px] font-semibold text-[#155EEF]">{children}</span>;
}

function ConnectedAccountRow({ provider }: { provider: { providerId: string; label: string; account: string } }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white text-[11px] font-semibold text-slate-700 shadow-sm">
          {provider.label.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-slate-950">{provider.label}</p>
          <p className="truncate text-[12px] text-slate-500">{provider.account}</p>
        </div>
      </div>
      <AccountSummaryTone tone="success">Connected</AccountSummaryTone>
    </div>
  );
}

function SessionRow({
  title,
  description,
  value,
  icon,
}: {
  title: string;
  description: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[#155EEF]">{icon}</span>
          <p className="text-[13px] font-medium text-slate-950">{title}</p>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">{description}</p>
      </div>
      <span className="text-right text-[13px] font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function PreferenceRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span className="text-[13px] text-slate-700">{label}</span>
      <AccountSummaryTone tone={tone}>{value}</AccountSummaryTone>
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-950">{label}</p>
        <p className="mt-1 text-[12px] text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-[#155EEF]" : "bg-slate-300"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

function ActivityBadge({ label }: { label: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EFF4FF] text-[11px] font-semibold text-[#155EEF]">
      {label
        .split(/[_\s-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase() || "A"}
    </div>
  );
}

function EmptyCopy({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-slate-300 bg-white px-3 py-3">
      <p className="text-[13px] font-medium text-slate-950">{title}</p>
      <p className="mt-1 text-[12px] leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  actionIcon,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-2 text-[16px] font-semibold tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actionLabel ? (
        actionHref ? (
          <Link href={actionHref} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#155EEF]">
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button type="button" onClick={onAction} className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 transition hover:border-[#155EEF] hover:text-[#155EEF]">
            {actionIcon}
            {actionLabel}
          </button>
        )
      ) : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function IdentityRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
      <span className="text-slate-400">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function InfoList({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`border-t border-slate-200 px-4 py-3 ${full ? "md:col-span-2" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-[13px] font-medium text-slate-950">{value}</p>
    </div>
  );
}
