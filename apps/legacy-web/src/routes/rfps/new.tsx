import { createFileRoute } from "@tanstack/react-router";
import { NewRfpWizard } from "@/components/rfp-wizard/new-rfp-wizard";

export const Route = createFileRoute("/rfps/new")({
  head: () => ({ meta: [{ title: "New RFP · Tendyy" }] }),
  component: NewRfpWizard,
});
