import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { regenerateDraft, updateRequirementAnswer } from "@/lib/api/requirements";
import { CURRENT_USER_ID, personName } from "@/lib/session";
import type { Requirement } from "@/types";

const SOURCE_LABEL: Record<Requirement["answerSource"], string> = {
  ai_draft: "AI draft",
  human_edited: "Human edited",
  reused: "Reused from prior RFP",
};

export function AnswerEditor({ requirement }: { requirement: Requirement }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(requirement.answer);

  const saveMutation = useMutation({
    mutationFn: (answer: string) =>
      updateRequirementAnswer(requirement.id, answer, personName(CURRENT_USER_ID)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requirements", requirement.id] });
      queryClient.invalidateQueries({ queryKey: ["requirements", "byRfp", requirement.rfpId] });
      setEditing(false);
      toast.success("Answer updated");
    },
    onError: () => toast.error("Couldn't save the answer. Try again."),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateDraft(requirement.id, personName(CURRENT_USER_ID)),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["requirements", requirement.id] });
      queryClient.invalidateQueries({ queryKey: ["requirements", "byRfp", requirement.rfpId] });
      setDraft(updated.answer);
      toast.success("Draft regenerated");
    },
    onError: () => toast.error("Couldn't regenerate the draft. Try again."),
  });

  function copy() {
    if (!navigator.clipboard) {
      toast.error("Clipboard isn't available in this browser");
      return;
    }
    navigator.clipboard
      .writeText(requirement.answer)
      .then(() => toast.success("Answer copied to clipboard"))
      .catch(() => toast.error("Couldn't copy the answer"));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Answer</h3>
          <Badge variant="secondary" className="font-normal text-muted-foreground">
            {SOURCE_LABEL[requirement.answerSource]}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {!editing && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
              >
                <Sparkles className="h-3.5 w-3.5" />{" "}
                {regenerateMutation.isPending ? "Regenerating…" : "Regenerate"}
              </Button>
              <Button size="sm" variant="ghost" onClick={copy}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(requirement.answer);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : requirement.answer ? (
        <p className="rounded-lg border bg-muted/30 p-3.5 text-sm leading-relaxed text-foreground">
          {requirement.answer}
        </p>
      ) : (
        <p className="rounded-lg border border-dashed p-3.5 text-sm text-muted-foreground">
          No answer drafted yet. Click Edit to write one, or Regenerate to have AI Assistant draft
          it.
        </p>
      )}
    </div>
  );
}
