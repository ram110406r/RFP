import { useRef, useState } from "react";
import { AlertCircle, Eye, FileText, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_UPLOAD_SIZE_MB, resolveDocumentType, simulateDocumentUpload } from "@/lib/api/rfps";
import { cn } from "@/lib/utils";
import type { WizardDocument } from "./types";

const SUPPORTED_LABEL = "PDF · DOCX · XLSX · PPTX · ZIP · HTML";

export function StepDocuments({
  documents,
  onChange,
}: {
  documents: WizardDocument[];
  onChange: (next: WizardDocument[] | ((prev: WizardDocument[]) => WizardDocument[])) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<WizardDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function runUpload(row: WizardDocument) {
    simulateDocumentUpload().then((result) => {
      onChange((prev) => prev.map((d) => (d.id === row.id ? { ...d, status: result.status } : d)));
      if (result.status === "failed") {
        toast.error(`${row.name} failed to upload`, { description: "You can retry or remove it." });
      }
    });
  }

  function addFiles(list: FileList) {
    const rows: WizardDocument[] = [];
    for (const f of Array.from(list)) {
      const type = resolveDocumentType(f.name);
      const sizeMb = Math.round((f.size / (1024 * 1024)) * 10) / 10 || 0.4;
      if (!type) {
        toast.error(`${f.name} isn't a supported file type`, { description: SUPPORTED_LABEL });
        continue;
      }
      if (sizeMb > MAX_UPLOAD_SIZE_MB) {
        toast.error(`${f.name} is too large`, {
          description: `Files must be ${MAX_UPLOAD_SIZE_MB}MB or smaller.`,
        });
        continue;
      }
      rows.push({
        id: `${Date.now()}-${rows.length}-${f.name}`,
        name: f.name,
        type,
        sizeMb,
        status: "uploading",
      });
    }
    if (rows.length === 0) return;
    onChange((prev) => [...prev, ...rows]);
    rows.forEach(runUpload);
  }

  function removeFile(id: string) {
    onChange((prev) => prev.filter((f) => f.id !== id));
  }

  function retryFile(row: WizardDocument) {
    onChange((prev) => prev.map((d) => (d.id === row.id ? { ...d, status: "uploading" } : d)));
    runUpload(row);
  }

  return (
    <div className="surface-panel space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Upload documents</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add the RFP questionnaire and any supporting attachments.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-primary bg-accent/50" : "border-border",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Drop your RFP files here</p>
        <p className="text-xs text-muted-foreground">{SUPPORTED_LABEL}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => fileInputRef.current?.click()}
        >
          Browse Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
              {doc.status === "uploading" ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : doc.status === "failed" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-success" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{doc.name}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.sizeMb} MB · {doc.type}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  doc.status === "uploaded" && "text-success",
                  doc.status === "uploading" && "text-muted-foreground",
                  doc.status === "failed" && "text-danger",
                )}
              >
                {doc.status === "uploaded" && "Uploaded"}
                {doc.status === "uploading" && "Uploading…"}
                {doc.status === "failed" && "Failed"}
              </span>
              {doc.status === "failed" && (
                <button
                  type="button"
                  onClick={() => retryFile(doc)}
                  aria-label={`Retry ${doc.name}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              {doc.status === "uploaded" && (
                <button
                  type="button"
                  onClick={() => setPreviewDoc(doc)}
                  aria-label={`Preview ${doc.name}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeFile(doc.id)}
                aria-label={`Remove ${doc.name}`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={previewDoc !== null} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="truncate">{previewDoc?.name}</DialogTitle>
            <DialogDescription>
              {previewDoc?.type} · {previewDoc?.sizeMb} MB
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Document preview isn't available yet — file metadata is saved, but content preview
              requires connecting an object storage backend (see server/.env.example).
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
