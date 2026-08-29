import { AppShell } from "../../../components/app-shell";
import { RfpIntakeWizard } from "../../../components/rfp-intake-wizard";

export default function NewTenderPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "RFPs", href: "/tenders" }, { label: "New RFP" }]}>
      <RfpIntakeWizard mode="create" />
    </AppShell>
  );
}
