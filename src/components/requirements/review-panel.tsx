import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, UserPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignReviewer, setRequirementStatus } from "@/lib/api/requirements";
import { CURRENT_USER_ID, getPerson, people, personName } from "@/data/people";
import type { Requirement } from "@/types";

export function ReviewPanel({ requirement }: { requirement: Requirement }) {
  const queryClient = useQueryClient();
  const [changesNote, setChangesNote] = useState("");
  const [showChangesInput, setShowChangesInput] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [assignTo, setAssignTo] = useState(requirement.reviewerId ?? "");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["requirements", requirement.id] });
    queryClient.invalidateQueries({ queryKey: ["requirements", "byRfp", requirement.rfpId] });
    queryClient.invalidateQueries({ queryKey: ["rfps", requirement.rfpId] });
    queryClient.invalidateQueries({ queryKey: ["reviews"] });
  }

  const statusMutation = useMutation({
    mutationFn: ({ status, note }: { status: Requirement["status"]; note?: string }) =>
      setRequirementStatus(requirement.id, status, personName(CURRENT_USER_ID), note),
    onSuccess: (_data, variables) => {
      invalidate();
      setShowChangesInput(false);
      setChangesNote("");
      toast.success(
        variables.status === "approved"
          ? "Requirement approved"
          : variables.status === "rejected"
            ? "Requirement rejected"
            : "Changes requested",
      );
    },
    onError: () => toast.error("Couldn't update the requirement. Try again."),
  });

  const assignMutation = useMutation({
    mutationFn: (reviewerId: string) =>
      assignReviewer(requirement.id, reviewerId, personName(CURRENT_USER_ID)),
    onSuccess: () => {
      invalidate();
      setShowAssign(false);
      toast.success("Reviewer assigned");
    },
    onError: () => toast.error("Couldn't assign the reviewer. Try again."),
  });

  const reviewer = getPerson(requirement.reviewerId);
  const locked = requirement.status === "approved" || requirement.status === "rejected";

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Review</h3>
        <span className="text-xs text-muted-foreground">
          Reviewer: {reviewer?.name ?? "Unassigned"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          disabled={locked || statusMutation.isPending}
          onClick={() => statusMutation.mutate({ status: "approved" })}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={locked || statusMutation.isPending}
          onClick={() => statusMutation.mutate({ status: "rejected" })}
        >
          <XCircle className="h-3.5 w-3.5" /> Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() => setShowChangesInput((v) => !v)}
        >
          Request changes
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowAssign((v) => !v)}>
          <UserPlus className="h-3.5 w-3.5" /> Assign
        </Button>
      </div>

      {showChangesInput && (
        <div className="space-y-2">
          <Textarea
            placeholder="What needs to change?"
            value={changesNote}
            onChange={(e) => setChangesNote(e.target.value)}
            rows={3}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!changesNote.trim() || statusMutation.isPending}
            onClick={() =>
              statusMutation.mutate({ status: "changes_requested", note: changesNote })
            }
          >
            Submit
          </Button>
        </div>
      )}

      {showAssign && (
        <div className="space-y-2">
          <Select value={assignTo} onValueChange={setAssignTo}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a reviewer" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {p.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="w-full"
            disabled={!assignTo || assignMutation.isPending}
            onClick={() => assignMutation.mutate(assignTo)}
          >
            Confirm assignment
          </Button>
        </div>
      )}
    </div>
  );
}
