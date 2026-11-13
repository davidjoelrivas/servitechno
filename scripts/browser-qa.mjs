import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const webUrl = process.env.QA_WEB_URL ?? "http://localhost:5173";
const testApi = process.env.QA_API_URL ?? "http://127.0.0.1:3020/api";
const adminPassword = process.env.QA_ADMIN_PASSWORD;
const demoPassword = process.env.QA_DEMO_PASSWORD;
if (!adminPassword || !demoPassword)
  throw new Error("QA_ADMIN_PASSWORD y QA_DEMO_PASSWORD son obligatorias");

const output = "artifacts/iteration5";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const failures = [];
const screenshots = [];
const checks = [];

async function context(viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route("http://localhost:3010/api/**", (route) =>
    route.continue({
      url: route.request().url().replace("http://localhost:3010/api", testApi),
    }),
  );
  return ctx;
}
async function login(page, email, password) {
  await page.goto(webUrl);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Iniciar sesión/ }).click();
  await page.locator("nav").waitFor();
}
async function shot(page, name) {
  await page.locator("h1").first().waitFor();
  await page.waitForLoadState("networkidle");
  const path = `${output}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
async function api(token, path, init = {}) {
  const response = await fetch(`${testApi}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = response.headers.get("content-type")?.includes("json")
    ? await response.json()
    : await response.arrayBuffer();
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`,
    );
  return body;
}

try {
  const adminContext = await context({ width: 1440, height: 1000 });
  const page = await adminContext.newPage();
  const suffix = Date.now();
  const uiTechnician = {
    email: `tecnico.ui.${suffix}@test.local`,
    password: `TecnicoUi-${suffix}!`,
  };
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  await login(page, "admin@servitechno.local", adminPassword);
  const adminRoutes = [
    "/",
    "/caja",
    "/ventas",
    "/reparaciones",
    "/inventario",
    "/gastos",
    "/clientes",
    "/devoluciones",
    "/compras",
    "/proveedores",
    "/comisiones",
    "/documentos",
    "/rendimiento",
    "/usuarios",
  ];
  for (const route of adminRoutes) {
    await page.goto(`${webUrl}${route}`);
    await page.locator("h1").first().waitFor();
    checks.push(
      `ADMIN ${route}: ${await page.locator("h1").first().innerText()}`,
    );
  }
  await page.goto(`${webUrl}/ventas`);
  await shot(page, "admin-sales-empty");
  await page.goto(`${webUrl}/reparaciones`);
  await shot(page, "admin-repairs-form");
  await page.goto(`${webUrl}/usuarios`);
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const field = (label) =>
    page.locator(".field").filter({ hasText: label }).locator("input").first();
  await field("Nombre").fill("Técnico creado desde interfaz");
  await field("Correo de inicio de sesión").fill(uiTechnician.email);
  await field("Contraseña inicial").fill(uiTechnician.password);
  await page.getByRole("checkbox", { name: "Vendedor" }).uncheck();
  await page.getByRole("checkbox", { name: "Técnico" }).check();
  await field("Comisión individual").fill("25");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByText(uiTechnician.email).waitFor();
  checks.push("ADMIN creó un técnico desde Usuarios y personal");
  const token = await page.evaluate(() =>
    sessionStorage.getItem("servitechno_token"),
  );
  const customer = await api(token, "/customers", {
    method: "POST",
    body: JSON.stringify({ name: `Cliente QA ${suffix}`, phone: "QA-9999" }),
  });
  const productInputs = [
    ["PHONE", "NEW", "Teléfono QA", "1500", "900", "IMEI-QA-NEW"],
    ["ACCESSORY", "NEW", "Accesorio QA", "200", "80", null],
    ["COMPUTER", "NEW", "Laptop QA", "4000", "2800", "SERIE-QA-PC"],
  ];
  const products = [];
  for (const [
    documentType,
    condition,
    name,
    salePrice,
    averageCost,
  ] of productInputs)
    products.push(
      await api(token, "/products", {
        method: "POST",
        body: JSON.stringify({
          sku: `QA-${documentType}-${suffix}`,
          name,
          salePrice,
          averageCost,
          stock: "2",
          minimumStock: "0",
          documentType,
          condition,
        }),
      }),
    );
  const methods = await api(token, "/payment-methods");
  const transfer = methods.find((method) => method.code === "TRANSFER");
  const sale = await api(token, "/sales", {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.id,
      discount: "0",
      items: products.map((product, index) => ({
        productId: product.id,
        quantity: "1",
        unitPrice: product.salePrice,
        serial: productInputs[index][5] ?? undefined,
        color: index === 0 ? "Negro" : undefined,
        capacity: index === 0 ? "128 GB" : undefined,
        specifications: index === 2 ? "16 GB RAM / 512 GB SSD" : undefined,
      })),
      payments: [
        {
          methodId: transfer.id,
          amount: "4700",
          idempotencyKey: `qa-sale-${suffix}`,
        },
      ],
    }),
  });
  await api(token, `/sales/${sale.id}/payments`, {
    method: "POST",
    body: JSON.stringify({
      methodId: transfer.id,
      amount: "1000",
      idempotencyKey: `qa-sale-later-${suffix}`,
    }),
  });
  const employees = await api(token, "/employees");
  const repair = await api(token, "/repairs", {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.id,
      technicianId: employees.find((employee) =>
        employee.name.includes("Técnico 1"),
      ).id,
      deviceType: "Teléfono",
      brand: "Samsung",
      model: "QA",
      serial: "IMEI-QA-REPAIR",
      reportedProblem: "No carga",
      serviceRequested: "Revisar puerto de carga",
      physicalCondition: "Pantalla con rayón leve",
      accessories: "Cable USB",
      conditionChecklist: {
        pantalla: "Rayón leve",
        carcasa: "Buen estado",
        puerto: "Desgastado",
        humedad: "Sin evidencia",
      },
    }),
  });
  const evidenceBody = new FormData();
  evidenceBody.append(
    "photos",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n9sAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "recepcion-qa.png",
  );
  const evidenceResponse = await fetch(
    `${testApi}/repairs/${repair.id}/evidence`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: evidenceBody,
    },
  );
  if (!evidenceResponse.ok)
    throw new Error(`Evidencia: ${evidenceResponse.status}`);
  await api(token, `/repairs/${repair.id}/complete`, {
    method: "POST",
    body: JSON.stringify({
      laborPrice: "500",
      workPerformed: "Cambio de conector de carga",
      parts: [
        {
          source: "MANUAL",
          description: "Conector de carga",
          quantity: "1",
          unitCost: "100",
          unitPrice: "200",
          costAlreadyRecorded: false,
        },
      ],
      payments: [
        {
          methodId: transfer.id,
          amount: "500",
          idempotencyKey: `qa-repair-${suffix}`,
        },
      ],
      commissionPercentage: "30",
    }),
  });
  await api(token, `/repairs/${repair.id}/payments`, {
    method: "POST",
    body: JSON.stringify({
      methodId: transfer.id,
      amount: "200",
      idempotencyKey: `qa-repair-later-${suffix}`,
    }),
  });
  const documents = await api(token, "/documents");
  const saleDocs = documents.filter(
    (document) => document.sourceId === sale.id,
  );
  const repairDocs = documents.filter(
    (document) => document.sourceId === repair.id,
  );
  if (saleDocs.length !== 4)
    failures.push(
      `Venta mixta produjo ${saleDocs.length} documentos, se esperaban 4`,
    );
  if (repairDocs.length !== 4)
    failures.push(
      `Reparación produjo ${repairDocs.length} documentos, se esperaban 4`,
    );
  for (const document of [...saleDocs, ...repairDocs]) {
    const pdf = await api(token, `/documents/${document.id}/pdf`);
    await writeFile(
      `${output}/document-${document.number}.pdf`,
      Buffer.from(pdf),
    );
  }
  checks.push(`Venta mixta: ${saleDocs.map((item) => item.type).join(", ")}`);
  checks.push(`Reparación: ${repairDocs.map((item) => item.type).join(", ")}`);
  await page.goto(`${webUrl}/reparaciones`);
  await page.locator("select").last().selectOption(repair.id);
  await page.locator('img[alt="recepcion-qa.png"]').waitFor();
  await shot(page, "admin-repair-evidence");
  await page.goto(`${webUrl}/documentos`);
  await page.getByText("Historial documental").waitFor();
  await shot(page, "admin-documents");
  await page.goto(`${webUrl}/rendimiento`);
  await shot(page, "admin-performance");
  await page.goto(`${webUrl}/usuarios`);
  await page.getByText("Personal (", { exact: false }).waitFor();
  await shot(page, "admin-users");
  await adminContext.close();

  for (const profile of [
    {
      email: uiTechnician.email,
      password: uiTechnician.password,
      name: "technician-created-in-ui",
      forbidden: [
        "Inicio",
        "Ventas",
        "Caja",
        "Gastos",
        "Comisiones",
        "Rendimiento",
        "Usuarios y personal",
      ],
    },
    {
      email: "demo.tech1@servitechno.local",
      name: "technician",
      forbidden: [
        "Inicio",
        "Ventas",
        "Caja",
        "Gastos",
        "Comisiones",
        "Rendimiento",
      ],
    },
    {
      email: "demo.seller@servitechno.local",
      name: "seller",
      forbidden: ["Inicio", "Rendimiento", "Comisiones"],
    },
  ]) {
    const ctx = await context({ width: 1280, height: 900 });
    const rolePage = await ctx.newPage();
    await login(
      rolePage,
      profile.email,
      profile.password ?? demoPassword,
    );
    const nav = await rolePage.locator("nav").innerText();
    for (const text of profile.forbidden)
      if (nav.split("\n").includes(text))
        failures.push(`${profile.name} ve menú prohibido: ${text}`);
    const roleToken = await rolePage.evaluate(() =>
      sessionStorage.getItem("servitechno_token"),
    );
    const financial = await fetch(`${testApi}/dashboard`, {
      headers: { Authorization: `Bearer ${roleToken}` },
    });
    if (financial.status !== 403)
      failures.push(
        `${profile.name} dashboard financiero devolvió ${financial.status}`,
      );
    await shot(rolePage, `${profile.name}-home`);
    await ctx.close();
  }

  const mobile = await context({ width: 390, height: 844 });
  const mobilePage = await mobile.newPage();
  await login(mobilePage, "admin@servitechno.local", adminPassword);
  await mobilePage.locator("header button").first().click();
  await shot(mobilePage, "admin-mobile-menu");
  await mobile.close();
} finally {
  await browser.close();
}

const result = { ok: failures.length === 0, checks, failures, screenshots };
await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
