"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@rfp-os/ui";

export const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** The MIME type to declare for a file, from its extension; null when the format is not accepted. */
export function documentMimeType(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return DOCUMENT_MIME_BY_EXTENSION[extension] ?? null;
}

export function formatBytes(bytes: number) {
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1_000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Drag-and-drop or browse. Rejected files (wrong type) are reported through
 * `onReject` rather than silently dropped.
 */
export function FileDropzone({
  onFiles,
  onReject,
  disabled = false,
  multiple = true,
  title = "Drop PDF or DOCX files here",
  hint = "Text is extracted, split into passages and indexed for answer drafting.",
  compact = false,
}: {
  onFiles: (files: Array<{ file: File; mimeType: string }>) => void;
  onReject?: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  title?: string;
  hint?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (list: FileList | null) => {
    if (!list || disabled) return;
    const accepted: Array<{ file: File; mimeType: string }> = [];
    const rejected: File[] = [];
    for (const file of Array.from(list)) {
      const mimeType = documentMimeType(file);
      if (mimeType) accepted.push({ file, mimeType });
      else rejected.push(file);
    }
    if (accepted.length) onFiles(multiple ? accepted : accepted.slice(0, 1));
    if (rejected.length) onReject?.(rejected);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        accept(event.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed px-6 text-center transition-colors ${
        compact ? "min-h-32 py-5" : "min-h-48 py-8"
      } ${dragging ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border-strong)] bg-[var(--surface-muted)]"} ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <Upload className="h-6 w-6 text-[var(--muted)]" aria-hidden />
      <p className="mt-3 text-[14px] font-semibold text-[var(--text)]">{title}</p>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[var(--muted)]">{hint}</p>
      <Button type="button" variant="secondary" className="mt-4" disabled={disabled} onClick={() => input.current?.click()}>
        Browse files
      </Button>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept=".pdf,.docx"
        className="sr-only"
        onChange={(event) => {
          accept(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
