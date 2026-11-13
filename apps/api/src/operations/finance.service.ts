import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, type JournalEntry } from "@prisma/client";

export type LedgerLine = { accountCode: string; debit?: Prisma.Decimal | string; credit?: Prisma.Decimal | string; memo?: string };

@Injectable()
export class FinanceService {
  async post(
    tx: Prisma.TransactionClient,
    input: { description: string; referenceType: string; referenceId: string; lines: LedgerLine[] },
  ): Promise<JournalEntry> {
    const debit = input.lines.reduce((sum, line) => sum.plus(line.debit ?? 0), new Prisma.Decimal(0));
    const credit = input.lines.reduce((sum, line) => sum.plus(line.credit ?? 0), new Prisma.Decimal(0));
    if (!debit.equals(credit) || debit.lessThanOrEqualTo(0)) throw new BadRequestException("El asiento contable no está balanceado");
    const accounts = await tx.account.findMany({ where: { code: { in: input.lines.map((line) => line.accountCode) } } });
    const byCode = new Map(accounts.map((account) => [account.code, account.id]));
    if (byCode.size !== new Set(input.lines.map((line) => line.accountCode)).size) {
      throw new BadRequestException("Falta una cuenta contable requerida");
    }
    return tx.journalEntry.create({
      data: {
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        lines: { create: input.lines.map((line) => ({
          accountId: byCode.get(line.accountCode)!,
          debit: line.debit ?? 0,
          credit: line.credit ?? 0,
          memo: line.memo,
        })) },
      },
    });
  }
}

