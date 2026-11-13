import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const webUrl = process.env.QA_WEB_URL ?? "http://localhost:5173";
const apiUrl = process.env.QA_API_URL;
const commercial = process.env.QA_COMMERCIAL === "true";
const adminPassword = process.env.QA_ADMIN_PASSWORD;
if (!adminPassword) throw new Error("QA_ADMIN_PASSWORD es obligatoria");

const output = "artifacts/iteration7";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (apiUrl)
    await context.route("http://localhost:3010/api/**", (route) =>
      route.continue({
        url: route.request().url().replace("http://localhost:3010/api", apiUrl),
      }),
    );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(webUrl);
  await page.locator('input[type="email"]').fill("admin@servitechno.local");
  await page.locator('input[type="password"]').fill(adminPassword);
  await page.getByRole("button", { name: /Iniciar sesión/ }).click();
  await page.locator("nav").waitFor();

  await page.getByRole("button", { name: /Asistente Servi Techno AI/ }).click();
  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Servi Techno AI" }),
  });
  await panel.getByText(/ollama · qwen3:4b/i).waitFor({ timeout: 15_000 });
  await panel.getByRole("button", { name: "Nueva conversación" }).click();
  await panel.getByRole("button", { name: "Consultar ventas" }).click();
  await panel.getByText(/Analizando y consultando/).waitFor();
  await panel.getByText(/Analizando y consultando/).waitFor({ state: "hidden", timeout: 90_000 });
  await panel.getByText(/L\s*[\d,.]+/).last().waitFor();

  const screenshot = `${output}/assistant-admin-sales.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  if (commercial) {
    await panel.getByRole("button", { name: "Nueva conversación" }).click();
    await page.waitForTimeout(500);
    const input = panel.locator("textarea");
    await input.fill(
      "Compré una Pantalla Samsung IA al Proveedor IA a 90 lempiras y quedó pendiente.",
    );
    await panel.getByRole("button", { name: "Enviar" }).click();
    await panel.getByText("Confirmación requerida").waitFor({ timeout: 90_000 });
    await panel.getByRole("heading", { name: "Registrar compra" }).waitFor();
    await panel.getByRole("button", { name: "Modificar" }).click();
    await input.fill("No, eran dos Pantalla Samsung IA, no una.");
    await panel.getByRole("button", { name: "Enviar" }).click();
    await panel.getByText("L 180.00", { exact: true }).first().waitFor({ timeout: 90_000 });
    await page.screenshot({ path: `${output}/assistant-purchase-corrected.png`, fullPage: true });
    await panel.getByRole("button", { name: "Confirmar" }).click();
    await panel.getByText(/Operación registrada correctamente/).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: `${output}/assistant-purchase-confirmed.png`, fullPage: true });
  }
  if (errors.length) throw new Error(`Errores de página: ${errors.join(" | ")}`);
  console.log(`QA navegador completada: ${screenshot}`);
  console.log("Panel visible, Ollama qwen3:4b disponible y consulta de ventas respondida.");
  if (commercial)
    console.log("Compra preparada, corregida y confirmada contra servitechno_test.");
} finally {
  await browser.close();
}
