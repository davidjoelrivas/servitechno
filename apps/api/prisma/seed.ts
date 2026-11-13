import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const permissions = [
  "dashboard.read",
  "customers.read",
  "customers.create",
  "inventory.read",
  "inventory.manage",
  "cash.read",
  "cash.open",
  "cash.close",
  "sales.read",
  "sales.create",
  "sales.refund",
  "repairs.read",
  "repairs.create",
  "repairs.update",
  "repairs.complete",
  "expenses.read",
  "expenses.create",
  "expenses.approve",
  "commissions.configure",
  "reports.financial.read",
  "users.manage",
  "settings.manage",
  "audit.read",
  "returns.read",
  "returns.create",
  "suppliers.read",
  "suppliers.manage",
  "purchases.read",
  "purchases.create",
  "purchases.pay",
  "commissions.read",
  "commissions.approve",
  "commissions.pay",
  "documents.read",
  "reports.team.read",
  "performance.self.read",
  "assistant.use",
];

const accounts = [
  ["1101", "Caja", "ASSET"],
  ["1102", "Bancos", "ASSET"],
  ["1103", "Cuentas por cobrar", "ASSET"],
  ["1104", "Inventario", "ASSET"],
  ["2101", "Cuentas por pagar", "LIABILITY"],
  ["2102", "Comisiones por pagar", "LIABILITY"],
  ["3101", "Capital", "EQUITY"],
  ["4101", "Ingresos por ventas", "REVENUE"],
  ["4102", "Ingresos por reparaciones", "REVENUE"],
  ["5101", "Costo de productos vendidos", "EXPENSE"],
  ["5102", "Costo de repuestos", "EXPENSE"],
  ["6101", "Gastos operativos", "EXPENSE"],
  ["6102", "Comisiones", "EXPENSE"],
  ["2103", "Saldos a favor de clientes", "LIABILITY"],
  ["4103", "Devoluciones sobre ventas", "REVENUE"],
] as const;

async function main() {
  const password = process.env.ADMIN_PASSWORD;
  for (const code of permissions)
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN", description: "Acceso administrativo completo" },
  });
  const sellerRole = await prisma.role.upsert({
    where: { name: "SELLER" },
    update: {},
    create: { name: "SELLER", description: "Ventas y caja" },
  });
  const technicianRole = await prisma.role.upsert({
    where: { name: "TECHNICIAN" },
    update: {},
    create: { name: "TECHNICIAN", description: "Servicio técnico" },
  });
  const allPermissions = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({
    data: allPermissions.map((permission) => ({
      roleId: adminRole.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });
  const sellerCodes = [
    "customers.read",
    "customers.create",
    "inventory.read",
    "cash.read",
    "cash.open",
    "cash.close",
    "sales.read",
    "sales.create",
    "repairs.read",
    "repairs.create",
    "expenses.read",
    "expenses.create",
    "returns.read",
    "returns.create",
    "suppliers.read",
    "purchases.read",
    "documents.read",
    "performance.self.read",
    "assistant.use",
  ];
  const techCodes = [
    "customers.read",
    "inventory.read",
    "repairs.read",
    "repairs.update",
    "repairs.complete",
    "documents.read",
    "performance.self.read",
    "assistant.use",
  ];
  await prisma.rolePermission.createMany({
    data: allPermissions
      .filter((p) => sellerCodes.includes(p.code))
      .map((p) => ({ roleId: sellerRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  await prisma.rolePermission.createMany({
    data: allPermissions
      .filter((p) => techCodes.includes(p.code))
      .map((p) => ({ roleId: technicianRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: sellerRole.id,
      permission: { code: { notIn: sellerCodes } },
    },
  });
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: technicianRole.id,
      permission: { code: { notIn: techCodes } },
    },
  });

  const email = (
    process.env.ADMIN_EMAIL ?? "admin@servitechno.local"
  ).toLowerCase();
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  const resetPassword = process.env.RESET_ADMIN_PASSWORD === "true";
  if (
    (!existingAdmin || resetPassword) &&
    (!password || password.length < 12)
  ) {
    throw new Error(
      "ADMIN_PASSWORD debe tener al menos 12 caracteres al crear o restablecer el administrador",
    );
  }
  const admin = existingAdmin
    ? await prisma.user.update({
        where: { email },
        data: resetPassword
          ? { passwordHash: await argon2.hash(password!) }
          : {},
      })
    : await prisma.user.create({
        data: {
          email,
          name: "Administrador",
          passwordHash: await argon2.hash(password!),
        },
      });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });
  for (const [id, name, position] of [
    ["employee-tech-1", "Técnico 1", "Técnico"],
    ["employee-tech-2", "Técnico 2", "Técnico"],
    ["employee-seller-1", "Vendedor", "Vendedor"],
  ] as const) {
    await prisma.employee.upsert({
      where: { id },
      update: { name, position },
      create: { id, name, position },
    });
  }

  if (
    process.env.SEED_TEST_USERS === "true" ||
    process.env.SEED_DEMO === "true"
  ) {
    const databaseName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
    if (!["servitechno_test", "servitechno_demo"].includes(databaseName))
      throw new Error(
        "Los usuarios de prueba solo pueden crearse en servitechno_test o servitechno_demo",
      );
    const testPassword = process.env.TEST_USER_PASSWORD;
    if (!testPassword || testPassword.length < 12)
      throw new Error("TEST_USER_PASSWORD debe tener al menos 12 caracteres");
    const profiles = [
      [
        "demo.tech1@servitechno.local",
        "Técnico 1 [DEMO]",
        technicianRole.id,
        "employee-tech-1",
      ],
      [
        "demo.tech2@servitechno.local",
        "Técnico 2 [DEMO]",
        technicianRole.id,
        "employee-tech-2",
      ],
      [
        "demo.seller@servitechno.local",
        "Vendedor [DEMO]",
        sellerRole.id,
        "employee-seller-1",
      ],
    ] as const;
    for (const [profileEmail, name, roleId, employeeId] of profiles) {
      const profile = await prisma.user.upsert({
        where: { email: profileEmail },
        update: { name, passwordHash: await argon2.hash(testPassword) },
        create: {
          email: profileEmail,
          name,
          passwordHash: await argon2.hash(testPassword),
        },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: profile.id, roleId } },
        update: {},
        create: { userId: profile.id, roleId },
      });
      await prisma.employee.update({
        where: { id: employeeId },
        data: { userId: profile.id },
      });
    }
  }

  if (process.env.SEED_DEMO === "true") {
    const databaseName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
    if (databaseName !== "servitechno_test")
      throw new Error(
        "SEED_DEMO con operaciones ficticias solo puede ejecutarse en servitechno_test",
      );
    const demoCustomer = await prisma.customer.findFirst({
      where: { phone: "DEMO-0001" },
    });
    if (!demoCustomer)
      await prisma.customer.create({
        data: {
          name: "Cliente de demostración [DEMO]",
          phone: "DEMO-0001",
          email: "cliente.demo@servitechno.local",
        },
      });
    const demoProducts = [
      ["DEMO-ACC-001", "Accesorio de demostración [DEMO]", 400, 220, 10],
      ["DEMO-REP-001", "Repuesto de demostración [DEMO]", 450, 300, 8],
    ] as const;
    for (const [sku, name, salePrice, averageCost, stock] of demoProducts) {
      const product = await prisma.product.upsert({
        where: { sku },
        update: {},
        create: { sku, name, salePrice, averageCost, stock, minimumStock: 2 },
      });
      const movement = await prisma.inventoryMovement.findFirst({
        where: {
          productId: product.id,
          referenceType: "DEMO_SEED",
          referenceId: product.id,
        },
      });
      if (!movement)
        await prisma.inventoryMovement.create({
          data: {
            productId: product.id,
            type: "ADJUSTMENT",
            quantity: stock,
            unitCost: averageCost,
            referenceType: "DEMO_SEED",
            referenceId: product.id,
            note: "Inventario inicial de demostración",
          },
        });
    }
  }

  for (const [code, name, type] of accounts)
    await prisma.account.upsert({
      where: { code },
      update: { name, type },
      create: { code, name, type },
    });
  await prisma.businessSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: "Servi Techno",
      currency: "HNL",
      timezone: process.env.BUSINESS_TIMEZONE ?? "America/Tegucigalpa",
      phone: "9680-6012",
      address:
        "Frente a calle principal, contiguo a Hotel San Judas, La Flecha, Macuelizo, Santa Bárbara",
    },
  });
  const commonConditions = [
    "La garantía comercial complementa y no limita derechos irrenunciables del consumidor.",
    "Toda reclamación será evaluada técnicamente y documentada con diagnóstico y justificación.",
    "Los daños externos solo excluyen fallas técnicamente relacionadas con esos daños.",
    "La operación puede acreditarse con este documento u otro comprobante verificable.",
  ];
  for (const policy of [
    {
      id: "PHONE_NEW",
      documentType: "PHONE",
      condition: "NEW",
      days: 60,
      title: "Garantía comercial provisional — teléfono nuevo",
    },
    {
      id: "PHONE_USED",
      documentType: "PHONE",
      condition: "USED",
      days: 60,
      title: "Garantía comercial — teléfono seminuevo",
    },
    {
      id: "COMPUTER_NEW",
      documentType: "COMPUTER",
      condition: "NEW",
      days: 60,
      title: "Garantía comercial — computadora nueva",
    },
    {
      id: "COMPUTER_USED",
      documentType: "COMPUTER",
      condition: "USED",
      days: 60,
      title: "Garantía comercial — computadora usada",
    },
    {
      id: "REPAIR_DEFAULT",
      documentType: "OTHER",
      condition: "USED",
      days: 30,
      title: "Garantía comercial provisional del trabajo realizado",
    },
  ] as const)
    await prisma.warrantyPolicy.upsert({
      where: { id: policy.id },
      update: {},
      create: { ...policy, conditions: commonConditions },
    });
  const register = await prisma.cashRegister.upsert({
    where: { name: "Caja principal" },
    update: {},
    create: { name: "Caja principal" },
  });
  const cashAccount = await prisma.financialAccount.upsert({
    where: { id: "cash-main" },
    update: {},
    create: { id: "cash-main", name: register.name, type: "CASH" },
  });
  const bankAccount = await prisma.financialAccount.upsert({
    where: { id: "bank-main" },
    update: {},
    create: { id: "bank-main", name: "Banco principal", type: "BANK" },
  });
  await prisma.paymentMethod.upsert({
    where: { code: "CASH" },
    update: {},
    create: {
      code: "CASH",
      name: "Efectivo",
      isCash: true,
      financialAccountId: cashAccount.id,
    },
  });
  await prisma.paymentMethod.upsert({
    where: { code: "TRANSFER" },
    update: {},
    create: {
      code: "TRANSFER",
      name: "Transferencia",
      financialAccountId: bankAccount.id,
    },
  });
  for (const name of [
    "Alquiler",
    "Electricidad",
    "Internet",
    "Transporte",
    "Herramientas",
    "Publicidad",
    "Otros",
  ]) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name, accountCode: "6101" },
    });
  }
  console.log(`Seed completado. Administrador: ${email}`);
}

main().finally(() => prisma.$disconnect());
