import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuthUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

const formats = [
  {
    mime: "image/jpeg",
    extension: "jpg",
    matches: (data: Buffer) =>
      data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  },
  {
    mime: "image/png",
    extension: "png",
    matches: (data: Buffer) =>
      data
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    extension: "webp",
    matches: (data: Buffer) =>
      data.subarray(0, 4).toString() === "RIFF" &&
      data.subarray(8, 12).toString() === "WEBP",
  },
];

@Injectable()
export class EvidenceService {
  private readonly directory: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.directory = config.get(
      "EVIDENCE_STORAGE_PATH",
      join(process.cwd(), "storage", "repair-evidence"),
    );
  }

  async list(repairId: string, user: AuthUser) {
    await this.assertRepairAccess(repairId, user);
    return this.prisma.repairEvidence.findMany({
      where: { repairId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async add(repairId: string, files: Express.Multer.File[], user: AuthUser) {
    await this.assertRepairAccess(repairId, user);
    if (!files?.length)
      throw new BadRequestException("Seleccione al menos una fotografía");
    const current = await this.prisma.repairEvidence.count({
      where: { repairId },
    });
    if (current + files.length > 20)
      throw new BadRequestException(
        "Una orden admite como máximo 20 fotografías",
      );
    await mkdir(this.directory, { recursive: true });
    const created = [];
    for (const file of files) {
      const format = formats.find(
        (candidate) =>
          candidate.mime === file.mimetype && candidate.matches(file.buffer),
      );
      if (!format)
        throw new BadRequestException(
          `El archivo ${file.originalname} no es una imagen JPEG, PNG o WebP válida`,
        );
      const storedName = `${randomUUID()}.${format.extension}`;
      const path = join(this.directory, storedName);
      await writeFile(path, file.buffer, { flag: "wx", mode: 0o600 });
      try {
        created.push(
          await this.prisma.repairEvidence.create({
            data: {
              repairId,
              originalName: file.originalname.slice(0, 180),
              storedName,
              mimeType: format.mime,
              size: file.size,
              createdById: user.sub,
            },
          }),
        );
      } catch (error) {
        await unlink(path).catch(() => undefined);
        throw error;
      }
    }
    await this.prisma.auditLog.create({
      data: {
        userId: user.sub,
        action: "repairs.evidence.add",
        entityType: "RepairOrder",
        entityId: repairId,
        after: { count: created.length },
      },
    });
    return this.list(repairId, user);
  }

  async file(id: string, user: AuthUser) {
    const evidence = await this.prisma.repairEvidence.findUnique({
      where: { id },
    });
    if (!evidence) throw new NotFoundException("Evidencia no encontrada");
    await this.assertRepairAccess(evidence.repairId, user);
    try {
      return {
        buffer: await readFile(join(this.directory, evidence.storedName)),
        mimeType: evidence.mimeType,
        filename: evidence.originalName,
      };
    } catch {
      throw new NotFoundException("El archivo de evidencia no está disponible");
    }
  }

  private async assertRepairAccess(repairId: string, user: AuthUser) {
    if (user.roles.includes("ADMIN")) {
      if (!(await this.prisma.repairOrder.count({ where: { id: repairId } })))
        throw new NotFoundException("Reparación no encontrada");
      return;
    }
    const employee = await this.prisma.employee.findUnique({
      where: { userId: user.sub },
    });
    const allowed = await this.prisma.repairOrder.count({
      where: {
        id: repairId,
        OR: [
          { receivedById: user.sub },
          ...(employee ? [{ technicianId: employee.id }] : []),
        ],
      },
    });
    if (!allowed)
      throw new ForbiddenException(
        "No tiene acceso a las evidencias de esta orden",
      );
  }
}
