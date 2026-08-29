import { AppShell } from "../../../components/app-shell";
import { RfpIntakeWizard } from "../../../components/rfp-intake-wizard";

export default function ImportTenderPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "RFPs", href: "/tenders" }, { label: "Import RFP" }]}>
      <RfpIntakeWizard mode="import" />
    </AppShell>
  );
}
