import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/common/multi-select";
import { cn } from "@/lib/utils";
import { people } from "@/lib/session";
import { RFP_CATEGORIES, type ConfigureValues } from "./types";

const PREFERENCE_COPY: {
  key: keyof ConfigureValues["preferences"];
  label: string;
  description: string;
}[] = [
  {
    key: "analyzeRequirements",
    label: "Analyze requirements",
    description: "Extract and structure requirements from the uploaded documents.",
  },
  {
    key: "detectMandatory",
    label: "Detect mandatory requirements",
    description: "Flag must-answer questions that block submission if left open.",
  },
  {
    key: "detectRisks",
    label: "Detect risks",
    description: "Surface requirements likely to carry commercial or delivery risk.",
  },
  {
    key: "searchKnowledge",
    label: "Search knowledge",
    description: "Match requirements against verified answers in the knowledge base.",
  },
  {
    key: "generateInitialAnswers",
    label: "Generate initial answers",
    description: "Draft a first-pass AI answer for every extracted requirement.",
  },
];

export function StepConfigure({
  value,
  onChange,
}: {
  value: ConfigureValues;
  onChange: (next: ConfigureValues) => void;
}) {
  function update<K extends keyof ConfigureValues>(key: K, v: ConfigureValues[K]) {
    onChange({ ...value, [key]: v });
  }

  function togglePreference(key: keyof ConfigureValues["preferences"]) {
    onChange({
      ...value,
      preferences: { ...value.preferences, [key]: !value.preferences[key] },
    });
  }

  const collaboratorOptions = people
    .filter((p) => p.id !== value.ownerId)
    .map((p) => ({ value: p.id, label: `${p.name} — ${p.role}` }));

  return (
    <div className="space-y-5">
      <div className="surface-panel space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Assignment</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Response Deadline</Label>
            <Input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={value.responseDeadline}
              onChange={(e) => update("responseDeadline", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>RFP Owner</Label>
            <Select value={value.ownerId} onValueChange={(v) => update("ownerId", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Collaborators</Label>
            <MultiSelect
              options={collaboratorOptions}
              selected={value.collaboratorIds}
              onChange={(next) => update("collaboratorIds", next)}
              placeholder="Add collaborators"
              className="w-full sm:w-72"
            />
          </div>
        </div>
      </div>

      <div className="surface-panel space-y-3 p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">RFP Categories</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Which areas should analysis focus on?
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RFP_CATEGORIES.map((cat) => {
            const active = value.categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() =>
                  update(
                    "categories",
                    active ? value.categories.filter((c) => c !== cat) : [...value.categories, cat],
                  )
                }
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <div className="surface-panel space-y-1 p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Processing preferences</h2>
        <div className="divide-y">
          {PREFERENCE_COPY.map((pref) => (
            <div
              key={pref.key}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{pref.label}</p>
                <p className="text-xs text-muted-foreground">{pref.description}</p>
              </div>
              <Switch
                checked={value.preferences[pref.key]}
                onCheckedChange={() => togglePreference(pref.key)}
                aria-label={pref.label}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
