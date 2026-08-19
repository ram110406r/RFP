import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Circle, FileText, Globe, Link2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StickySummary } from "@/components/common/sticky-summary";
import { Button } from "@/components/ui/button";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { createRfp } from "@/lib/api/rfps";
import { people } from "@/data/people";
import { cn } from "@/lib/utils";
import type { RfpDocument } from "@/types";

export const Route = createFileRoute("/rfps/new")({
  head: () => ({ meta: [{ title: "New RFP · RFP OS" }] }),
  component: NewRfpPage,
});

const schema = z.object({
  title: z.string().min(3, "Give this RFP a title"),
  customer: z.string().min(2, "Customer name is required"),
  opportunity: z.string().optional(),
  estimatedValue: z.coerce.number().min(0, "Enter a valid amount"),
  deadline: z
    .string()
    .min(1, "Set a submission deadline")
    .refine((v) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(v) >= today;
    }, "Deadline can't be in the past"),
  ownerId: z.string().min(1, "Assign an owner"),
});

type FormValues = z.infer<typeof schema>;

interface UploadRow {
  id: string;
  name: string;
  type: RfpDocument["type"];
  sizeMb: number;
  status: "processing" | "ready";
}

const MAX_FILE_SIZE_MB = 50;
const EXTENSION_TYPES: Record<string, RfpDocument["type"]> = {
  pdf: "PDF",
  docx: "DOCX",
  xlsx: "XLSX",
  pptx: "PPTX",
};

const SOURCE_MODES = [
  { id: "upload", label: "Upload file", icon: Upload },
  { id: "url", label: "From URL", icon: Link2 },
  { id: "web", label: "Web portal", icon: Globe },
  { id: "import", label: "Import from CRM", icon: FileText },
] as const;

function useDragUpload(onFiles: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: () => setDragging(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      },
    },
  };
}

function NewRfpPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadRow[]>([]);
  const [sourceMode, setSourceMode] = useState<(typeof SOURCE_MODES)[number]["id"]>("upload");
  const [sourceValue, setSourceValue] = useState("");
  const [prefs, setPrefs] = useState({
    autoDraft: true,
    flagLowConfidence: true,
    reusePriorAnswers: true,
    mandatoryOnly: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      customer: "",
      opportunity: "",
      estimatedValue: 0,
      deadline: "",
      ownerId: "p1",
    },
  });

  function addFiles(list: FileList) {
    const rows: UploadRow[] = [];
    for (const f of Array.from(list)) {
      const extension = f.name.split(".").pop()?.toLowerCase() ?? "";
      const type = EXTENSION_TYPES[extension];
      const sizeMb = Math.round((f.size / (1024 * 1024)) * 10) / 10 || 0.4;
      if (!type) {
        toast.error(`${f.name} isn't a supported file type`, {
          description: "Upload PDF, DOCX, XLSX, or PPTX files.",
        });
        continue;
      }
      if (sizeMb > MAX_FILE_SIZE_MB) {
        toast.error(`${f.name} is too large`, {
          description: `Files must be ${MAX_FILE_SIZE_MB}MB or smaller.`,
        });
        continue;
      }
      rows.push({
        id: `${Date.now()}-${rows.length}`,
        name: f.name,
        type,
        sizeMb,
        status: "processing",
      });
    }
    if (rows.length === 0) return;
    setFiles((prev) => [...prev, ...rows]);
    rows.forEach((row, i) => {
      setTimeout(
        () => {
          setFiles((prev) => prev.map((f) => (f.id === row.id ? { ...f, status: "ready" } : f)));
        },
        900 + i * 400,
      );
    });
  }

  const { dragging, handlers } = useDragUpload(addFiles);

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  const createMutation = useMutation({
    mutationFn: createRfp,
    onSuccess: (rfp) => {
      queryClient.invalidateQueries({ queryKey: ["rfps"] });
      if (rfp.status === "draft") {
        toast.success("Saved as draft", { description: `${rfp.title} was added to your RFPs.` });
        navigate({ to: "/rfps" });
      } else {
        toast.success("RFP created", {
          description: "Documents are being analyzed and requirements extracted.",
        });
        navigate({ to: "/rfps/$rfpId", params: { rfpId: rfp.id } });
      }
    },
    onError: () => toast.error("Couldn't create the RFP. Try again."),
  });

  const hasSourceReference = sourceMode !== "upload" && sourceValue.trim().length > 0;

  function submit(values: FormValues, asDraft: boolean) {
    const sourceDocument: { name: string; type: RfpDocument["type"]; sizeMb: number }[] =
      hasSourceReference
        ? [
            {
              name:
                sourceMode === "import" ? `CRM record ${sourceValue.trim()}` : sourceValue.trim(),
              type: "HTML",
              sizeMb: 0,
            },
          ]
        : [];
    createMutation.mutate({
      ...values,
      opportunity: values.opportunity ?? "",
      documents: [
        ...files.map((f) => ({ name: f.name, type: f.type, sizeMb: f.sizeMb })),
        ...sourceDocument,
      ],
      asDraft,
    });
  }

  const values = form.watch();
  const documentCount = files.length + (hasSourceReference ? 1 : 0);
  const checklist = [
    { label: "Title provided", done: values.title.trim().length >= 3 },
    { label: "Customer provided", done: values.customer.trim().length >= 2 },
    { label: "Deadline set", done: Boolean(values.deadline) },
    { label: "At least 1 document uploaded", done: documentCount > 0 },
    { label: "Owner assigned", done: Boolean(values.ownerId) },
  ];
  const readiness = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New RFP"
        description="Upload the RFP package and let AI Assistant extract requirements automatically."
      />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => submit(v, false))}
          className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]"
        >
          <div className="space-y-6">
            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">Basic information</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>RFP title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Enterprise Cloud Platform RFP" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Meridian Health Systems" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="opportunity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opportunity ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional CRM reference" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="estimatedValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated value (USD)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step={1000} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Submission deadline</FormLabel>
                      <FormControl>
                        <Input type="date" min={new Date().toISOString().slice(0, 10)} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Owner</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {people.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — {p.role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">Upload documents</h2>
              <div
                {...handlers}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                  dragging ? "border-primary bg-accent/50" : "border-border",
                )}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-foreground">Drag and drop RFP documents here</p>
                <p className="text-xs text-muted-foreground">
                  PDF, DOCX, XLSX, PPTX up to 50MB each
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{f.name}</p>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full bg-primary transition-all",
                              f.status === "ready" ? "w-full" : "w-2/3 animate-pulse",
                            )}
                          />
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{f.sizeMb}MB</span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          f.status === "ready" ? "text-success" : "text-muted-foreground",
                        )}
                      >
                        {f.status === "ready" ? "Ready" : "Processing…"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        aria-label={`Remove ${f.name}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">Source / questionnaire</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SOURCE_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const active = sourceMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSourceMode(mode.id)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              {sourceMode !== "upload" && (
                <div className="space-y-1.5">
                  <Label htmlFor="source-value">
                    {sourceMode === "url" && "Document URL"}
                    {sourceMode === "web" && "Portal URL"}
                    {sourceMode === "import" && "CRM record ID"}
                  </Label>
                  <Input
                    id="source-value"
                    value={sourceValue}
                    onChange={(e) => setSourceValue(e.target.value)}
                    placeholder={sourceMode === "import" ? "OPP-20501" : "https://…"}
                  />
                </div>
              )}
            </section>

            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">Processing preferences</h2>
              <div className="divide-y">
                <PreferenceRow
                  label="Auto-draft answers with AI"
                  description="Generate a first-pass answer for every extracted requirement."
                  checked={prefs.autoDraft}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, autoDraft: v }))}
                />
                <PreferenceRow
                  label="Flag low-confidence answers for review"
                  description="Route anything under 60% confidence straight to a reviewer."
                  checked={prefs.flagLowConfidence}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, flagLowConfidence: v }))}
                />
                <PreferenceRow
                  label="Reuse prior won RFP answers"
                  description="Allow drafting from previously won proposals when no primary source exists."
                  checked={prefs.reusePriorAnswers}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, reusePriorAnswers: v }))}
                />
                <PreferenceRow
                  label="Extract mandatory requirements only"
                  description="Skip optional / informational questions during extraction."
                  checked={prefs.mandatoryOnly}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, mandatoryOnly: v }))}
                />
              </div>
            </section>
          </div>

          <StickySummary>
            <div>
              <h2 className="text-sm font-semibold text-foreground">RFP summary</h2>
              <p className="mt-1 text-xs text-muted-foreground">Preview of what will be created.</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Title</dt>
                <dd className="truncate text-right font-medium text-foreground">
                  {values.title || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Customer</dt>
                <dd className="truncate text-right font-medium text-foreground">
                  {values.customer || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Deadline</dt>
                <dd className="num text-right font-medium text-foreground">
                  {values.deadline || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Documents</dt>
                <dd className="num text-right font-medium text-foreground">{documentCount}</dd>
              </div>
            </dl>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Readiness</span>
                <span className="num font-medium text-foreground">{readiness}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${readiness}%` }}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-xs">
                    {item.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create RFP"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={createMutation.isPending}
                onClick={form.handleSubmit((v) => submit(v, true))}
              >
                Save draft
              </Button>
            </div>
          </StickySummary>
        </form>
      </Form>
    </div>
  );
}

function PreferenceRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
