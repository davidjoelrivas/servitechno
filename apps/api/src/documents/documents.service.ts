import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentType, Prisma, PrismaClient } from "@prisma/client";
import PDFDocument = require("pdfkit");
import type { AuthUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Prisma.TransactionClient;
type Snapshot = Record<string, any>;

const saleConditions = [
  "La garantía comercial complementa y no limita los derechos irrenunciables del consumidor.",
  "La cobertura se aplica a defectos relacionados con el producto vendido durante el plazo indicado.",
  "La evaluación debe documentar el diagnóstico y la relación entre la falla y la cobertura solicitada.",
  "Daños por golpes, humedad o intervención externa solo excluyen fallas técnicamente relacionadas y debidamente justificadas.",
  "La reclamación puede acreditarse mediante este documento u otro comprobante verificable de la operación.",
];

const repairConditions = [
  "La garantía comercial cubre exclusivamente el trabajo y los componentes identificados en este documento.",
  "Toda reclamación será evaluada técnicamente y su resolución incluirá diagnóstico y justificación.",
  "Una condición ajena al trabajo efectuado no invalida derechos aplicables sobre el servicio contratado.",
  "Esta política comercial no limita derechos irrenunciables reconocidos por la legislación aplicable.",
];

const intakeConditions = [
  "El cliente autoriza el diagnóstico del equipo y deberá aprobar trabajos o costos adicionales antes de su ejecución.",
  "Servi Techno informará riesgos técnicos específicos conocidos y comunicará la finalización del servicio.",
  "El cliente es responsable de respaldar su información cuando sea posible; el negocio solo accederá a datos con autorización y finalidad técnica.",
  "La entrega requiere identificación o acreditación de autorización. Ningún retraso transfiere automáticamente la propiedad del equipo.",
];

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createSaleDocuments(tx: Tx, saleId: string, userId: string) {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: { include: { method: true } },
      },
    });
    const business = await tx.businessSetting.findUniqueOrThrow({
      where: { id: "default" },
    });
    const receiptSnapshot = {
      business,
      sale,
      customer: sale.customer,
      items: sale.items,
      payments: sale.payments,
    } as unknown as Prisma.InputJsonValue;
    await tx.businessDocument.upsert({
      where: { dedupKey: `SALE:${sale.id}:RECEIPT` },
      update: {},
      create: {
        type: DocumentType.SALE_RECEIPT,
        dedupKey: `SALE:${sale.id}:RECEIPT`,
        sourceType: "SALE",
        sourceId: sale.id,
        ownerUserId: sale.userId,
        snapshot: receiptSnapshot,
        createdById: userId,
      },
    });
    for (const item of sale.items) {
      if (!["PHONE", "COMPUTER"].includes(item.product.documentType)) continue;
      const policy = await tx.warrantyPolicy.findFirst({
        where: {
          documentType: item.product.documentType,
          condition: item.product.condition,
          active: true,
        },
        orderBy: { version: "desc" },
      });
      if (!policy) continue;
      const days =
        item.warrantyDays ?? item.product.warrantyDays ?? policy.days;
      const start = sale.confirmedAt ?? sale.createdAt;
      const end = new Date(start.getTime() + days * 86_400_000);
      const snapshot = {
        business,
        sale: { id: sale.id, number: sale.number, createdAt: sale.createdAt },
        customer: sale.customer,
        item,
        product: item.product,
        policy: { id: policy.id, version: policy.version, days },
      } as unknown as Prisma.InputJsonValue;
      await tx.businessDocument.upsert({
        where: { dedupKey: `SALE:${sale.id}:WARRANTY:${item.id}` },
        update: {},
        create: {
          type: DocumentType.SALE_WARRANTY,
          dedupKey: `SALE:${sale.id}:WARRANTY:${item.id}`,
          sourceType: "SALE",
          sourceId: sale.id,
          relatedItemId: item.id,
          ownerUserId: sale.userId,
          snapshot,
          conditionsTitle: policy.title,
          conditions: policy.conditions as Prisma.InputJsonValue,
          warrantyStart: start,
          warrantyEnd: end,
          createdById: userId,
        },
      });
    }
  }

  async createRepairIntake(tx: Tx, repairId: string, userId: string) {
    const repair = await tx.repairOrder.findUniqueOrThrow({
      where: { id: repairId },
      include: { customer: true, technician: true },
    });
    const business = await tx.businessSetting.findUniqueOrThrow({
      where: { id: "default" },
    });
    const receivedBy = await tx.user.findUnique({
      where: { id: repair.receivedById },
      select: { name: true, email: true },
    });
    const snapshot = {
      business,
      repair,
      customer: repair.customer,
      receivedBy,
      conditions: intakeConditions,
    } as unknown as Prisma.InputJsonValue;
    await tx.businessDocument.upsert({
      where: { dedupKey: `REPAIR:${repair.id}:INTAKE` },
      update: {},
      create: {
        type: DocumentType.REPAIR_INTAKE,
        dedupKey: `REPAIR:${repair.id}:INTAKE`,
        sourceType: "REPAIR",
        sourceId: repair.id,
        ownerUserId: repair.receivedById,
        employeeId: repair.technicianId,
        snapshot,
        conditionsTitle: "Condiciones de recepción",
        conditions: intakeConditions,
        createdById: userId,
      },
    });
  }

  async createRepairCompletionDocuments(
    tx: Tx,
    repairId: string,
    userId: string,
  ) {
    const repair = await tx.repairOrder.findUniqueOrThrow({
      where: { id: repairId },
      include: {
        customer: true,
        technician: true,
        parts: { include: { product: true, supplier: true } },
        payments: { include: { method: true } },
      },
    });
    const business = await tx.businessSetting.findUniqueOrThrow({
      where: { id: "default" },
    });
    const snapshot = {
      business,
      repair,
      customer: repair.customer,
      parts: repair.parts,
      payments: repair.payments,
    } as unknown as Prisma.InputJsonValue;
    await tx.businessDocument.upsert({
      where: { dedupKey: `REPAIR:${repair.id}:RECEIPT` },
      update: {},
      create: {
        type: DocumentType.REPAIR_RECEIPT,
        dedupKey: `REPAIR:${repair.id}:RECEIPT`,
        sourceType: "REPAIR",
        sourceId: repair.id,
        ownerUserId: repair.receivedById,
        employeeId: repair.technicianId,
        snapshot,
        createdById: userId,
      },
    });
    const policy = await tx.warrantyPolicy.findUnique({
      where: { id: "REPAIR_DEFAULT" },
    });
    if (!policy) return;
    const start = new Date();
    const end = new Date(start.getTime() + policy.days * 86_400_000);
    await tx.businessDocument.upsert({
      where: { dedupKey: `REPAIR:${repair.id}:WARRANTY` },
      update: {},
      create: {
        type: DocumentType.REPAIR_WARRANTY,
        dedupKey: `REPAIR:${repair.id}:WARRANTY`,
        sourceType: "REPAIR",
        sourceId: repair.id,
        ownerUserId: repair.receivedById,
        employeeId: repair.technicianId,
        snapshot,
        conditionsTitle: policy.title,
        conditions: policy.conditions as Prisma.InputJsonValue,
        warrantyStart: start,
        warrantyEnd: end,
        createdById: userId,
      },
    });
  }

  async createPaymentReceipt(
    tx: Tx,
    input: {
      sourceType: "SALE" | "REPAIR";
      sourceId: string;
      paymentId: string;
      userId: string;
      paid: Prisma.Decimal;
      balance: Prisma.Decimal;
    },
  ) {
    const business = await tx.businessSetting.findUniqueOrThrow({
      where: { id: "default" },
    });
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: input.paymentId },
      include: { method: true },
    });
    const receivedBy = await tx.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    });
    const sale =
      input.sourceType === "SALE"
        ? await tx.sale.findUniqueOrThrow({
            where: { id: input.sourceId },
            include: { customer: true },
          })
        : null;
    const repair =
      input.sourceType === "REPAIR"
        ? await tx.repairOrder.findUniqueOrThrow({
            where: { id: input.sourceId },
            include: { customer: true, technician: true },
          })
        : null;
    const source = sale ?? repair!;
    const customer = source.customer;
    const snapshot = {
      business,
      sale,
      repair,
      customer,
      payment,
      receivedBy,
      cumulativePaid: input.paid.toString(),
      remainingBalance: input.balance.toString(),
    } as unknown as Prisma.InputJsonValue;
    await tx.businessDocument.upsert({
      where: { dedupKey: `PAYMENT:${payment.id}:RECEIPT` },
      update: {},
      create: {
        type: DocumentType.PAYMENT_RECEIPT,
        dedupKey: `PAYMENT:${payment.id}:RECEIPT`,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        ownerUserId:
          input.sourceType === "SALE" ? sale!.userId : repair!.receivedById,
        employeeId: repair?.technicianId,
        snapshot,
        createdById: input.userId,
      },
    });
  }

  async listForUser(user: AuthUser) {
    const where = await this.scope(user);
    return this.prisma.businessDocument.findMany({
      where,
      select: {
        id: true,
        number: true,
        type: true,
        sourceType: true,
        sourceId: true,
        warrantyStart: true,
        warrantyEnd: true,
        createdAt: true,
        snapshot: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async renderForUser(id: string, user: AuthUser) {
    const document = await this.prisma.businessDocument.findUnique({
      where: { id },
    });
    if (!document) throw new NotFoundException("Documento no encontrado");
    const where = await this.scope(user);
    const allowed = await this.prisma.businessDocument.count({
      where: { AND: [{ id }, where] },
    });
    if (!allowed)
      throw new ForbiddenException("No tiene acceso a este documento");
    return {
      filename: `servi-techno-${document.number}.pdf`,
      buffer: await this.render(
        document.type,
        document.number,
        document.snapshot as Snapshot,
        document.conditions as string[] | null,
        document.warrantyStart,
        document.warrantyEnd,
      ),
    };
  }

  private async scope(
    user: AuthUser,
  ): Promise<Prisma.BusinessDocumentWhereInput> {
    if (user.roles.includes("ADMIN")) return {};
    const employee = await this.prisma.employee.findUnique({
      where: { userId: user.sub },
    });
    return {
      OR: [
        { ownerUserId: user.sub },
        ...(employee ? [{ employeeId: employee.id }] : []),
      ],
    };
  }

  private render(
    type: DocumentType,
    number: number,
    snapshot: Snapshot,
    conditions: string[] | null,
    start: Date | null,
    end: Date | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({
        size: "LETTER",
        margin: 42,
        info: { Title: `Servi Techno - ${type} #${number}` },
      });
      const chunks: Buffer[] = [];
      pdf.on("data", (chunk) => chunks.push(chunk));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
      const business = snapshot.business ?? {};
      const sale = snapshot.sale;
      const repair = snapshot.repair;
      const customer = snapshot.customer;
      pdf.roundedRect(42, 38, 92, 54, 8).fill("#102a43");
      pdf.fillColor("#ffffff").fontSize(26).text("ST", 66, 50);
      pdf.fillColor("#102a43").fontSize(18).text("SERVI TECHNO", 150, 43);
      pdf
        .fontSize(9)
        .fillColor("#52606d")
        .text(
          business.address ?? "La Flecha, Macuelizo, Santa Bárbara",
          150,
          67,
        )
        .text(business.phone ?? "9680-6012", 150, 80);
      const titles: Record<DocumentType, string> = {
        SALE_RECEIPT: "RECIBO DE VENTA",
        SALE_WARRANTY: "GARANTÍA COMERCIAL",
        REPAIR_INTAKE: "TICKET DE RECEPCIÓN",
        REPAIR_RECEIPT: "RECIBO DE REPARACIÓN",
        REPAIR_WARRANTY: "GARANTÍA DE REPARACIÓN",
        PAYMENT_RECEIPT: "COMPROBANTE DE ABONO",
      };
      pdf
        .moveDown(3)
        .fontSize(19)
        .fillColor("#111827")
        .text(titles[type], { align: "center" });
      pdf
        .fontSize(9)
        .text(`Documento ST-${String(number).padStart(6, "0")}`, {
          align: "center",
        })
        .moveDown();
      const row = (label: string, value: unknown) => {
        if (value !== undefined && value !== null && value !== "")
          pdf
            .fontSize(10)
            .fillColor("#111827")
            .text(`${label}: `, { continued: true })
            .font("Helvetica-Bold")
            .text(String(value))
            .font("Helvetica");
      };
      row("Cliente", customer?.name ?? "Consumidor final");
      row("Teléfono", customer?.phone);
      row(
        "Fecha",
        new Date(
          snapshot.payment?.createdAt ??
            sale?.createdAt ??
            repair?.createdAt ??
            Date.now(),
        ).toLocaleString("es-HN"),
      );
      if (sale) {
        row("Venta", `#${sale.number}`);
        const items = snapshot.items ?? (snapshot.item ? [snapshot.item] : []);
        pdf.moveDown().font("Helvetica-Bold").text("Detalle").font("Helvetica");
        for (const item of items)
          row(
            item.product?.name ?? snapshot.product?.name ?? "Artículo",
            `Cant. ${item.quantity} · L ${item.total ?? item.unitPrice}`,
          );
        row(
          "Total",
          `L ${sale.total ?? snapshot.item?.total ?? snapshot.item?.unitPrice}`,
        );
        row("Pagado", sale.paid ? `L ${sale.paid}` : undefined);
        row("Saldo", sale.balance ? `L ${sale.balance}` : undefined);
      }
      if (repair) {
        row("Orden", `#${repair.number}`);
        row(
          "Equipo",
          `${repair.deviceType ?? ""} ${repair.brand ?? ""} ${repair.model ?? ""}`.trim(),
        );
        row("IMEI/serie", repair.serial);
        row("Responsable de recepción", snapshot.receivedBy?.name);
        row("Falla reportada", repair.reportedProblem);
        row("Servicio solicitado", repair.serviceRequested);
        row("Estado físico", repair.physicalCondition);
        row("Accesorios entregados", repair.accessories);
        if (repair.conditionChecklist)
          for (const [key, value] of Object.entries(repair.conditionChecklist))
            row(`Revisión ${key}`, value);
        row("Diagnóstico", repair.diagnosis);
        row("Trabajo realizado", repair.workPerformed);
        row("Técnico", repair.technician?.name);
        if (type === DocumentType.REPAIR_INTAKE)
          row(
            "Evidencia fotográfica",
            `Consulte el historial privado de la orden #${repair.number}`,
          );
        row(
          "Importe",
          repair.finalPrice ? `L ${repair.finalPrice}` : undefined,
        );
        if (snapshot.parts?.length) {
          pdf
            .moveDown()
            .font("Helvetica-Bold")
            .text("Repuestos")
            .font("Helvetica");
          for (const part of snapshot.parts)
            row(part.description, `${part.quantity} × L ${part.unitPrice}`);
        }
      }
      if (snapshot.payment) {
        pdf
          .moveDown()
          .font("Helvetica-Bold")
          .text("Abono recibido")
          .font("Helvetica");
        row("Monto del abono", `L ${snapshot.payment.amount}`);
        row("Método", snapshot.payment.method?.name);
        row("Total pagado acumulado", `L ${snapshot.cumulativePaid}`);
        row("Saldo pendiente", `L ${snapshot.remainingBalance}`);
        row("Recibido por", snapshot.receivedBy?.name);
      }
      if (snapshot.item || snapshot.product) {
        const item = snapshot.item ?? {};
        const product = snapshot.product ?? item.product ?? {};
        row("Producto", product.name);
        row(
          "Condición",
          product.condition === "USED" ? "Seminuevo/usado" : "Nuevo",
        );
        row("Marca / modelo", `${product.name ?? ""}`);
        row("Color", item.color);
        row("Capacidad", item.capacity);
        row("IMEI/serie", item.serial);
      }
      if (start && end) {
        row("Inicio de garantía", start.toLocaleDateString("es-HN"));
        row("Vencimiento comercial", end.toLocaleDateString("es-HN"));
      }
      const clauses = conditions ?? snapshot.conditions;
      if (clauses?.length) {
        pdf
          .moveDown()
          .font("Helvetica-Bold")
          .text("Condiciones")
          .font("Helvetica")
          .fontSize(8);
        for (const clause of clauses)
          pdf.text(`• ${clause}`, { paragraphGap: 3 });
      }
      pdf
        .moveDown(2)
        .fontSize(8)
        .fillColor("#7b8794")
        .text(
          "Política comercial provisional sujeta a revisión jurídica. No limita derechos irrenunciables aplicables.",
        );
      pdf
        .moveDown(3)
        .fillColor("#111827")
        .fontSize(9)
        .text(
          "____________________________                         ____________________________",
        )
        .text(
          "Firma del cliente                                                  Firma del responsable",
        );
      pdf.end();
    });
  }
}
