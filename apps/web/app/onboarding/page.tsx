"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { CheckboxGroup, ChoiceGroup, displayValue, ErrorNotice, Field, FormFooter, FormGrid, OnboardingForm, OnboardingShell, PrimaryAction, SelectField, Summary } from "../../components/onboarding-ui";
import { acceptOnboardingInvitation, completeOnboarding, createOnboardingWorkspace, fetchOnboardingStatus, saveOnboardingCompany, saveOnboardingContext, saveOnboardingProfile, saveOnboardingTeam, startOnboarding, type OnboardingStatus } from "../../lib/api";

type CompanyForm = { name: string; legalName: string; website: string; industry: string; companySize: string; country: string; operatingRegion: string; description: string; coreProducts: string; certifications: string };
type WorkspaceForm = { name: string; slug: string; purpose: string; timezone: string; currency: string };
type ProfileForm = { name: string; preferredName: string; jobTitle: string; department: string; timezone: string; phone: string };
type RfpForm = { rfpVolume: string; typicalRfpTypes: string; mainIndustries: string; reviewProcess: string; commonCategories: string };
type Action = UseMutationResult<unknown, Error, () => Promise<unknown>>;
type BaseProps = { data: OnboardingStatus; action: Action; error: string | null };

const companySteps = ["Company", "Workspace", "Your profile", "Team", "RFP setup", "Review", "Complete"];
const employeeSteps = ["Invitation", "Profile", "Team", "Access", "Complete"];
const companyIndex: Record<string, number> = { COMPANY: 0, WORKSPACE: 1, PROFILE: 2, TEAM: 3, RFP_CONTEXT: 4, REVIEW: 5, COMPLETE: 6 };
const employeeIndex: Record<string, number> = { INVITATION: 0, ORGANIZATION: 0, PROFILE: 1, ATTRIBUTES: 1, TEAM: 2, ACCESS: 3, COMPLETE: 4 };
const rfpTypes = ["Documents", "Web questionnaires", "Security questionnaires", "Vendor assessments"];

export default function OnboardingPage() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ["onboarding", "status"], queryFn: fetchOnboardingStatus });
  const [error, setError] = useState<string | null>(null);
  const zone = browserTimezone();
  const [company, setCompany] = useState<CompanyForm>({ name: "", legalName: "", website: "", industry: "", companySize: "", country: "", operatingRegion: "", description: "", coreProducts: "", certifications: "" });
  const [workspace, setWorkspace] = useState<WorkspaceForm>({ name: "", slug: "", purpose: "", timezone: zone, currency: "USD" });
  const [profile, setProfile] = useState<ProfileForm>({ name: "", preferredName: "", jobTitle: "", department: "", timezone: zone, phone: "" });
  const [teamNames, setTeamNames] = useState("");
  const [emails, setEmails] = useState("");
  const [rfp, setRfp] = useState<RfpForm>({ rfpVolume: "MEDIUM", typicalRfpTypes: "", mainIndustries: "", reviewProcess: "", commonCategories: "" });
  const data = status.data;

  useEffect(() => {
    if (!data) return;
    const c = data.progress.company as Partial<CompanyForm>;
    const p = data.progress.profile as Partial<ProfileForm>;
    const t = data.progress.team as { teams?: unknown; invites?: Array<{ email?: unknown }> };
    const r = data.progress.rfpContext as Partial<RfpForm>;
    setCompany((v) => ({ ...v, ...c, coreProducts: listValue(c.coreProducts), certifications: listValue(c.certifications) }));
    setProfile((v) => ({ ...v, name: data.user.name || v.name, preferredName: data.user.preferredName || v.preferredName, jobTitle: data.user.jobTitle || p.jobTitle || v.jobTitle, department: data.user.department || p.department || v.department, timezone: data.user.timezone || p.timezone || v.timezone, phone: data.user.phone || v.phone }));
    setTeamNames(listValue(t.teams));
    setEmails(Array.isArray(t.invites) ? t.invites.map((i) => typeof i.email === "string" ? i.email : "").filter(Boolean).join(", ") : "");
    setRfp((v) => ({ ...v, ...r, typicalRfpTypes: listValue(r.typicalRfpTypes), mainIndustries: listValue(r.mainIndustries), commonCategories: listValue(r.commonCategories) }));
  }, [data]);

  const action = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => { setError(null); await client.invalidateQueries({ queryKey: ["onboarding", "status"] }); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Please try again."),
  });

  if (status.isLoading) return <Status title="Loading your onboarding" copy="Restoring your saved setup progress..." />;
  if (status.isError || !data) return <Status title="We could not load onboarding" copy="Refresh the page and try again." failed />;
  if (!data.journey) return <JourneyChoice data={data} action={action} error={error} />;
  return data.journey === "COMPANY"
    ? <CompanyJourney data={data} action={action} error={error} company={company} setCompany={setCompany} workspace={workspace} setWorkspace={setWorkspace} profile={profile} setProfile={setProfile} teamNames={teamNames} setTeamNames={setTeamNames} emails={emails} setEmails={setEmails} rfp={rfp} setRfp={setRfp} />
    : <EmployeeJourney data={data} action={action} error={error} profile={profile} setProfile={setProfile} />;
}

function JourneyChoice({ data, action, error }: BaseProps) {
  const invite = data.invitations[0];
  if (invite) return <OnboardingShell eyebrow="Invitation" title="You are invited to join" description="Review the organization and access selected by your inviter." contextTitle="Join an existing workspace" contextDescription="Your company has already configured TENDYY. Complete only your personal profile." contextItems={["Company settings remain read-only", "Access is assigned by an administrator", "Usually takes less than 2 minutes"]}>
    <ErrorNotice error={error} /><Summary rows={[["Organization", invite.organizationName], ["Workspace", invite.workspaceName ?? "Organization access"], ["Team", invite.proposedTeamName ?? "Not assigned"], ["Role", displayValue(invite.role)]]} />
    <div className="mt-7"><PrimaryAction busy={action.isPending} onClick={() => action.mutate(() => startOnboarding({ journey: "EMPLOYEE", invitationId: invite.id }))}>Review invitation</PrimaryAction></div>
  </OnboardingShell>;
  return <OnboardingShell eyebrow="Welcome" title="Welcome to TENDYY" description="Set up your organization, workspace, profile, and RFP workflow in about 3 minutes." contextTitle="Built for response operations" contextDescription="TENDYY keeps intake, evidence, answer generation, and review in one governed workspace." contextItems={["Real organization data", "Secure role-aware access", "Resume setup at any time"]}>
    <ErrorNotice error={error} />
    {data.accountState === "EXPIRED_INVITATION" ? <p className="mb-6 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Your invitation expired. Ask for a new invitation, or create a company if authorized.</p> : null}
    <PrimaryAction busy={action.isPending} onClick={() => action.mutate(() => startOnboarding({ journey: "COMPANY" }))}>Get started</PrimaryAction>
    <p className="mt-4 text-xs text-slate-500">Create a company only if you are its owner or authorized administrator.</p>
  </OnboardingShell>;
}

type CompanyProps = BaseProps & {
  company: CompanyForm; setCompany: Dispatch<SetStateAction<CompanyForm>>;
  workspace: WorkspaceForm; setWorkspace: Dispatch<SetStateAction<WorkspaceForm>>;
  profile: ProfileForm; setProfile: Dispatch<SetStateAction<ProfileForm>>;
  teamNames: string; setTeamNames: (v: string) => void; emails: string; setEmails: (v: string) => void;
  rfp: RfpForm; setRfp: Dispatch<SetStateAction<RfpForm>>;
};

function CompanyJourney(props: CompanyProps) {
  const { data, action, error } = props;
  const state = data.progress.currentState;
  const shell = { labels: companySteps, active: companyIndex[state] ?? 0, ...contextFor(state) };
  if (state === "COMPANY") return <OnboardingShell {...shell} eyebrow="Company" title="Tell us about your company" description="This information configures your TENDYY organization and secure data boundary.">
    <ErrorNotice error={error} /><OnboardingForm onSubmit={() => action.mutate(() => saveOnboardingCompany({ ...props.company, coreProducts: split(props.company.coreProducts), certifications: split(props.company.certifications) }))}>
      <Field id="company-name" label="Company name" value={props.company.name} required autoComplete="organization" placeholder="Acme Technologies" onChange={(name) => props.setCompany({ ...props.company, name })} />
      <Field id="legal-name" label="Legal company name" value={props.company.legalName} autoComplete="organization" placeholder="Acme Technologies Private Limited" onChange={(legalName) => props.setCompany({ ...props.company, legalName })} />
      <Field id="website" label="Website" type="url" value={props.company.website} autoComplete="url" placeholder="https://acme.com" onChange={(website) => props.setCompany({ ...props.company, website })} />
      <FormGrid><Field id="industry" label="Industry" value={props.company.industry} placeholder="Technology" onChange={(industry) => props.setCompany({ ...props.company, industry })} /><Field id="size" label="Company size" value={props.company.companySize} placeholder="51-200 employees" onChange={(companySize) => props.setCompany({ ...props.company, companySize })} /></FormGrid>
      <Field id="country" label="Country" value={props.company.country} autoComplete="country-name" placeholder="India" onChange={(country) => props.setCompany({ ...props.company, country })} /><FormFooter busy={action.isPending} />
    </OnboardingForm>
  </OnboardingShell>;
  if (state === "WORKSPACE") return <OnboardingShell {...shell} eyebrow="Workspace" title="Create your workspace" description="Your team will manage RFPs, evidence, answers, and reviews here.">
    <ErrorNotice error={error} /><OnboardingForm onSubmit={() => action.mutate(() => createOnboardingWorkspace(props.workspace))}>
      <Field id="workspace-name" label="Workspace name" value={props.workspace.name} required placeholder="Enterprise RFP" onChange={(name) => props.setWorkspace({ ...props.workspace, name })} />
      <Field id="workspace-slug" label="Workspace slug" value={props.workspace.slug} required hint={props.workspace.slug ? props.workspace.slug + ".tendyy" : "A short URL-friendly identifier, such as acme-rfp."} placeholder="acme-rfp" onChange={(slug) => props.setWorkspace({ ...props.workspace, slug: slugify(slug) })} />
      <Field id="purpose" label="Workspace purpose" value={props.workspace.purpose} placeholder="Manage enterprise tenders" onChange={(purpose) => props.setWorkspace({ ...props.workspace, purpose })} />
      <Field id="workspace-zone" label="Workspace time zone" value={props.workspace.timezone} required hint="Detected from your browser. Use an IANA time zone." onChange={(timezone) => props.setWorkspace({ ...props.workspace, timezone })} /><FormFooter busy={action.isPending} />
    </OnboardingForm>
  </OnboardingShell>;
  if (state === "PROFILE") return <ProfileStep {...shell} data={data} action={action} error={error} profile={props.profile} setProfile={props.setProfile} />;
  if (state === "TEAM") return <OnboardingShell {...shell} eyebrow="Team" title="Build your response team" description="Invite collaborators now, or continue alone and configure your team later.">
    <ErrorNotice error={error} /><OnboardingForm onSubmit={() => action.mutate(() => saveTeam(props.teamNames, props.emails))}>
      <Field id="team" label="Initial team" value={props.teamNames} hint="Use commas for multiple teams." placeholder="Presales" onChange={props.setTeamNames} />
      <Field id="emails" label="Team member emails" value={props.emails} hint="Separate emails with commas. Initial access is Viewer." placeholder="name@company.com" onChange={props.setEmails} />
      <FormFooter busy={action.isPending} secondaryLabel="Skip for now" onSecondary={() => action.mutate(() => saveOnboardingTeam({ teams: [], invites: [] }))} />
    </OnboardingForm>
  </OnboardingShell>;
  if (state === "RFP_CONTEXT") {
    const selected = split(props.rfp.typicalRfpTypes);
    return <OnboardingShell {...shell} eyebrow="RFP setup" title="Configure your RFP workflow" description="A few preferences help TENDYY organize the response work you handle.">
      <ErrorNotice error={error} /><OnboardingForm onSubmit={() => action.mutate(() => saveOnboardingContext({ ...props.rfp, typicalRfpTypes: selected, mainIndustries: split(props.rfp.mainIndustries), commonCategories: split(props.rfp.commonCategories) }))}>
        <ChoiceGroup legend="How many RFPs do you typically handle?" value={props.rfp.rfpVolume} options={[{ value: "LOW", label: "1-5 / month" }, { value: "MEDIUM", label: "6-20 / month" }, { value: "HIGH", label: "21+ / month" }]} onChange={(rfpVolume) => props.setRfp({ ...props.rfp, rfpVolume })} />
        <CheckboxGroup legend="What types of responses do you handle?" values={selected} options={rfpTypes} onChange={(values) => props.setRfp({ ...props.rfp, typicalRfpTypes: values.join(", ") })} />
        <Field id="industries" label="Main customer industries" value={props.rfp.mainIndustries} hint="Optional. Separate with commas." placeholder="Financial services, Healthcare" onChange={(mainIndustries) => props.setRfp({ ...props.rfp, mainIndustries })} /><FormFooter busy={action.isPending} />
      </OnboardingForm>
    </OnboardingShell>;
  }
  if (state === "REVIEW") {
    const saved = data.progress.company as Record<string, unknown>;
    const team = data.progress.team as { invites?: unknown[] };
    return <OnboardingShell {...shell} eyebrow="Review" title="Your workspace is ready" description="Review the real details saved to your organization before completing setup.">
      <ErrorNotice error={error} /><OnboardingForm onSubmit={() => action.mutate(() => completeOnboarding({}))}>
        <Summary rows={[["Organization", String(saved.name ?? "")], ["Workspace", data.workspace?.name ?? ""], ["Your role", displayValue(data.user.jobTitle || "Company owner")], ["Department", displayValue(data.user.department)], ["Time zone", data.user.timezone], ["Team members", String(Array.isArray(team.invites) ? team.invites.length : 0) + " invited"]]} /><FormFooter label="Complete setup" busy={action.isPending} />
      </OnboardingForm>
    </OnboardingShell>;
  }
  return <Complete labels={companySteps} title="You are ready to go" copy="Your TENDYY organization and workspace are ready." />;
}

function EmployeeJourney({ data, action, error, profile, setProfile }: BaseProps & { profile: ProfileForm; setProfile: Dispatch<SetStateAction<ProfileForm>> }) {
  const state = data.progress.currentState;
  const invite = data.invitations.find((i) => i.id === data.progress.invitationId) ?? data.invitations[0];
  const shell = { labels: employeeSteps, active: employeeIndex[state] ?? 0, contextTitle: "Join an existing workspace", contextDescription: "Your organization controls company settings and access. You provide only your work profile.", contextItems: ["Organization remains read-only", "Permissions are administrator-assigned", "Progress is saved securely"] };
  if (state === "INVITATION" && invite) return <OnboardingShell {...shell} eyebrow="Invitation" title={"Join " + invite.organizationName} description="Confirm the workspace and access assigned by your organization."><ErrorNotice error={error} /><Summary rows={[["Organization", invite.organizationName], ["Workspace", invite.workspaceName ?? "Organization access"], ["Team", invite.proposedTeamName ?? "Not assigned"], ["Role", displayValue(invite.role)]]} /><div className="mt-7"><PrimaryAction busy={action.isPending} onClick={() => action.mutate(() => acceptOnboardingInvitation(invite.id))}>Accept invitation</PrimaryAction></div></OnboardingShell>;
  if (state === "PROFILE") return <ProfileStep {...shell} data={data} action={action} error={error} profile={profile} setProfile={setProfile} />;
  if (state === "TEAM") return <OnboardingShell {...shell} eyebrow="Team" title="Confirm your team" description="This assignment comes from your organization and cannot be elevated here."><ErrorNotice error={error} /><OnboardingForm onSubmit={() => action.mutate(() => saveOnboardingTeam({ teams: [], invites: [] }))}><Summary rows={[["Organization", data.membership?.organizationName ?? ""], ["Department", displayValue(data.user.department)], ["Team", invite?.proposedTeamName ?? "Not assigned"]]} /><FormFooter label="Confirm team" busy={action.isPending} /></OnboardingForm></OnboardingShell>;
  if (state === "ACCESS") return <OnboardingShell {...shell} eyebrow="Access" title="Your workspace access" description="Your administrator-assigned role controls what you can do in TENDYY."><ErrorNotice error={error} /><OnboardingForm onSubmit={() => action.mutate(() => completeOnboarding({}))}><Summary rows={[["Workspace", data.workspace?.name ?? "Organization workspace"], ["Team", invite?.proposedTeamName ?? "Not assigned"], ["Role", displayValue(data.membership?.role ?? "VIEWER")], ["Department", displayValue(data.user.department)]]} /><FormFooter label="Enter workspace" busy={action.isPending} /></OnboardingForm></OnboardingShell>;
  return <Complete labels={employeeSteps} title="You have joined the workspace" copy="Your profile and assigned access are ready." />;
}

function ProfileStep({ data, action, error, profile, setProfile, ...shell }: BaseProps & { profile: ProfileForm; setProfile: Dispatch<SetStateAction<ProfileForm>>; labels: string[]; active: number; contextTitle: string; contextDescription: string; contextItems: string[] }) {
  return <OnboardingShell {...shell} eyebrow="Your profile" title="Tell us about you" description="Your profile helps route response work. It does not grant additional permissions."><ErrorNotice error={error} /><OnboardingForm onSubmit={() => action.mutate(() => saveOnboardingProfile(profile))}>
    <Field id="full-name" label="Full name" value={profile.name} required autoComplete="name" placeholder="Rahul Anand" onChange={(name) => setProfile({ ...profile, name })} />
    <FormGrid><SelectField id="job-title" label="Job title" value={profile.jobTitle} options={data.controlledValues.jobTitles} onChange={(jobTitle) => setProfile({ ...profile, jobTitle })} /><SelectField id="department" label="Department" value={profile.department} options={data.controlledValues.departments} onChange={(department) => setProfile({ ...profile, department })} /></FormGrid>
    <Field id="profile-zone" label="Time zone" value={profile.timezone} required hint="Detected from your browser. You can change it." onChange={(timezone) => setProfile({ ...profile, timezone })} />
    <Field id="phone" label="Phone" value={profile.phone} type="tel" autoComplete="tel" hint="Optional" onChange={(phone) => setProfile({ ...profile, phone })} /><FormFooter busy={action.isPending} />
  </OnboardingForm></OnboardingShell>;
}

function Complete({ labels, title, copy }: { labels: string[]; title: string; copy: string }) {
  return <OnboardingShell labels={labels} active={labels.length - 1} eyebrow="Setup complete" title={title} description={copy} contextTitle="Everything is in place" contextDescription="Your organization context and workspace permissions are active." contextItems={["Onboarding persisted", "Workspace access active", "Ready for real RFP work"]}><div className="mb-7 flex h-12 w-12 items-center justify-center rounded-full border border-green-200 bg-green-50 text-green-700"><svg viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg></div><PrimaryAction busy={false} onClick={() => window.location.assign("/")}>Go to dashboard</PrimaryAction></OnboardingShell>;
}

function Status({ title, copy, failed = false }: { title: string; copy: string; failed?: boolean }) {
  return <OnboardingShell eyebrow={failed ? "Unable to continue" : "TENDYY"} title={title} description={copy}>{failed ? <button type="button" onClick={() => location.reload()} className="h-12 rounded-[10px] bg-slate-950 px-5 text-sm font-semibold text-white">Try again</button> : <div className="h-1 w-40 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" /></div>}</OnboardingShell>;
}

function contextFor(state: string) {
  const map: Record<string, { contextTitle: string; contextDescription: string; contextItems: string[] }> = {
    COMPANY: { contextTitle: "Your organization boundary", contextDescription: "Company details establish the secure data boundary for every tender and knowledge source.", contextItems: ["Used for workspace ownership", "Visible to invited members", "Editable later in settings"] },
    WORKSPACE: { contextTitle: "One place for response work", contextDescription: "The workspace connects tenders, evidence, answers, and reviews.", contextItems: ["Dedicated workspace identity", "Owner access created automatically", "Members join by invitation"] },
    PROFILE: { contextTitle: "Route work clearly", contextDescription: "Role and department attributes help organize assignments without changing permissions.", contextItems: ["Personal profile only", "No privilege changes", "Browser time zone suggested"] },
    TEAM: { contextTitle: "Start small", contextDescription: "Invite collaborators now or build your response team later.", contextItems: ["Secure invitations", "No membership before acceptance", "This step is optional"] },
    RFP_CONTEXT: { contextTitle: "Tailor the workspace", contextDescription: "Preferences help organize the RFP types your team handles.", contextItems: ["No sample data", "Editable later", "No AI calls during setup"] },
    REVIEW: { contextTitle: "Confirm before launch", contextDescription: "Every displayed value comes from saved onboarding state.", contextItems: ["Backend-owned data", "No mock completion values", "Access activates on completion"] },
  };
  return map[state] ?? { contextTitle: "Setup complete", contextDescription: "TENDYY is ready.", contextItems: ["Organization active", "Workspace active", "Profile active"] };
}

function saveTeam(teams: string, emails: string) { return saveOnboardingTeam({ teams: split(teams), invites: split(emails).map((email) => ({ email, role: "VIEWER" })) }); }
function split(value: string) { return value.split(",").map((v) => v.trim()).filter(Boolean); }
function listValue(value: unknown) { return Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : ""; }
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100); }
function browserTimezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } }
