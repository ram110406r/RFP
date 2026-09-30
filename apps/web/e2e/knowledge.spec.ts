import { expect, test, type Page } from "@playwright/test";

/**
 * Knowledge Brain flow against a running stack: create a draft source, see a
 * failed action surface as an error toast, upload a document, watch it move
 * through processing, accept a suggested claim, then approve and archive.
 *
 * The document-processing part needs the worker running (it parses, embeds
 * and extracts claims); set PLAYWRIGHT_KNOWLEDGE_WORKER=1 to include it.
 * AI_PROVIDER=mock keeps extraction deterministic (it reads "Label: value"
 * lines), which is what the claim assertions below rely on.
 */

const authenticated = Boolean(process.env.PLAYWRIGHT_E2E && process.env.PLAYWRIGHT_E2E_EMAIL && process.env.PLAYWRIGHT_E2E_PASSWORD);
const withWorker = process.env.PLAYWRIGHT_KNOWLEDGE_WORKER === "1";

if (typeof Bun === "undefined") test.describe("knowledge brain", () => {
  test.skip(!authenticated, "Set PLAYWRIGHT_E2E with a seeded test user to run the knowledge flow.");
  test.describe.configure({ mode: "serial" });

  test("draft, failure toast, upload, suggested claim, approve, archive", async ({ page }) => {
    test.setTimeout(withWorker ? 180_000 : 60_000);
    const name = `E2E knowledge ${Date.now()}`;

    // Create a draft source by hand.
    await page.goto("/knowledge/sources");
    await page.getByRole("button", { name: "New source" }).click();
    const sheet = page.getByRole("dialog", { name: "New source" });
    await sheet.getByLabel(/^Name/).fill(name);
    await sheet.getByRole("button", { name: "Create draft" }).click();
    await expectToast(page, `Created ${name} as a draft`);

    // Open it from the list.
    await page.getByPlaceholder("Search sources").fill(name);
    await page.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("Not used in tender answers yet")).toBeVisible();

    // A failing action reports itself instead of silently doing nothing.
    await page.route("**/knowledge/sources/*/approve", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "E2E", message: "Injected failure" } }) }),
    );
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not approve the source" })).toBeVisible();
    await page.unroute("**/knowledge/sources/*/approve");

    // Upload a document to the source.
    await page.locator('input[type="file"]').setInputFiles({
      name: "e2e-policy.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(minimalPdf("Backup retention: 35 days")),
    });
    await expectToast(page, "Uploaded e2e-policy.pdf");
    await expect(page.getByText("e2e-policy.pdf")).toBeVisible();

    if (withWorker) {
      // The detail page polls while the document processes; no reload needed.
      await expect(page.getByText(/^Indexed/)).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText(/Suggested claims \(\d+\)/)).toBeVisible({ timeout: 60_000 });
      await page.getByRole("button", { name: "Accept", exact: true }).first().click();
      await expectToast(page, "Accepted 1 claim");
      await expect(page.getByText(/Citable facts \([1-9]\d*\)/)).toBeVisible();
      await expect(page.getByText("35 days")).toBeVisible();
    }

    // Approve for real, then clean up.
    await page.getByRole("button", { name: "Approve" }).click();
    await expectToast(page, `${name} is approved and available to tenders`);
    await expect(page.getByText("Not used in tender answers yet")).toHaveCount(0);
    await page.getByRole("button", { name: "Archive" }).click();
    await expectToast(page, `Archived ${name}`);
  });

  test("overview shows a live refresh indicator", async ({ page }) => {
    await page.goto("/knowledge");
    const refresh = page.getByRole("button", { name: "Refresh" }).first();
    await expect(refresh).toContainText(/Updated/);
    await refresh.click();
    await expect(refresh).toContainText(/Updated just now/);
  });
});

async function expectToast(page: Page, text: string) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * A one-page PDF whose only text is `line`. Offsets in the xref table are
 * computed, so strict parsers accept it without repair.
 */
function minimalPdf(line: string): string {
  const escaped = line.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return body;
}
