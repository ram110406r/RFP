import { useState } from "react";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { createRfp } from "@/lib/api/rfps";
import { CURRENT_USER_ID } from "@/lib/session";
import { WizardStepper } from "./wizard-stepper";
import { StepDetails } from "./step-details";
import { StepDocuments } from "./step-documents";
import { StepConfigure } from "./step-configure";
import { StepAnalyze } from "./step-analyze";
import {
  DEFAULT_PREFERENCES,
  RFP_CATEGORIES,
  detailsSchema,
  WIZARD_STEPS,
  type ConfigureValues,
  type DetailsValues,
  type WizardDocument,
  type WizardStepId,
} from "./types";

export function NewRfpWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStepId>("details");
  const [documents, setDocuments] = useState<WizardDocument[]>([]);
  const [configureTouched, setConfigureTouched] = useState(false);
  const [configure, setConfigure] = useState<ConfigureValues>({
    responseDeadline: "",
    ownerId: CURRENT_USER_ID,
    collaboratorIds: [],
    categories: [...RFP_CATEGORIES],
    preferences: DEFAULT_PREFERENCES,
  });
  const [rfpCreated, setRfpCreated] = useState(false);

  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      title: "",
      customer: "",
      opportunity: "",
      estimatedValue: 0,
      deadline: "",
      ownerId: CURRENT_USER_ID,
    },
  });

  function updateConfigure(next: ConfigureValues) {
    setConfigureTouched(true);
    setConfigure(next);
  }

  const details = form.watch();
  const isDirty =
    details.title.trim().length > 0 ||
    details.customer.trim().length > 0 ||
    documents.length > 0 ||
    configureTouched;
  const hasUnsavedChanges = isDirty && !rfpCreated;

  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
    enableBeforeUnload: () => hasUnsavedChanges,
    withResolver: true,
  });

  const draftMutation = useMutation({
    mutationFn: createRfp,
    onSuccess: (rfp) => {
      queryClient.invalidateQueries({ queryKey: ["rfps"] });
      setRfpCreated(true);
      toast.success("Saved as draft", { description: `${rfp.title} was added to your RFPs.` });
      navigate({ to: "/rfps" });
    },
    onError: () => toast.error("Couldn't save the draft. Try again."),
  });

  function buildDocumentPayload() {
    return documents
      .filter((d) => d.status === "uploaded")
      .map((d) => ({ name: d.name, type: d.type, sizeMb: d.sizeMb }));
  }

  function handleSaveDraft() {
    void form.handleSubmit(
      (values) => {
        draftMutation.mutate({
          ...values,
          opportunity: values.opportunity ?? "",
          documents: buildDocumentPayload(),
          collaboratorIds: configure.collaboratorIds,
          asDraft: true,
        });
      },
      () => {
        setStep("details");
        toast.error("Add the required details before saving a draft.");
      },
    )();
  }

  function goToDocuments() {
    void form.handleSubmit(() => setStep("documents"))();
  }

  async function createFinalRfp() {
    const values = form.getValues();
    const rfp = await createRfp({
      ...values,
      opportunity: values.opportunity ?? "",
      documents: buildDocumentPayload(),
      ownerId: configure.ownerId || values.ownerId,
      collaboratorIds: configure.collaboratorIds,
      asDraft: false,
    });
    queryClient.invalidateQueries({ queryKey: ["rfps"] });
    setRfpCreated(true);
    return rfp;
  }

  function handleCancel() {
    navigate({ to: "/rfps" });
  }

  const uploading = documents.some((d) => d.status === "uploading");
  const showFooter = step !== "analyze";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="New request" title="Create New RFP" />
      <WizardStepper current={step} />

      <div className="pb-2">
        {step === "details" && <StepDetails form={form} />}
        {step === "documents" && <StepDocuments documents={documents} onChange={setDocuments} />}
        {step === "configure" && <StepConfigure value={configure} onChange={updateConfigure} />}
        {step === "analyze" && (
          <StepAnalyze
            documentCount={documents.filter((d) => d.status === "uploaded").length}
            categories={configure.categories}
            createRfp={createFinalRfp}
            onOpenWorkspace={(rfpId) => navigate({ to: "/rfps/$rfpId", params: { rfpId } })}
          />
        )}
      </div>

      {showFooter && (
        <div className="flex flex-col-reverse items-center gap-3 border-t pt-5 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={draftMutation.isPending}
            >
              {draftMutation.isPending ? "Saving…" : "Save Draft"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {step !== "details" && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setStep(WIZARD_STEPS[WIZARD_STEPS.findIndex((s) => s.id === step) - 1]!.id)
                }
              >
                Back
              </Button>
            )}
            {step === "details" && <Button onClick={goToDocuments}>Continue</Button>}
            {step === "documents" && (
              <Button onClick={() => setStep("configure")} disabled={uploading}>
                Continue
              </Button>
            )}
            {step === "configure" && <Button onClick={() => setStep("analyze")}>Continue</Button>}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Leave without saving?"
        description="This RFP hasn't been saved. Your entered details, documents, and configuration will be lost."
        confirmLabel="Leave"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}
