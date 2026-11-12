import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Counter-backed human readable references. Atomic (single upsert with increment). */
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the next integer for a counter key. */
  async nextValue(key: string, tx?: Prisma.TransactionClient): Promise<number> {
    const db = tx ?? this.prisma;
    const row = await db.counter.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
    });
    return row.value;
  }

  private pad(n: number, width: number) {
    return String(n).padStart(width, '0');
  }

  /** INV-0001 */
  async investor(tx?: Prisma.TransactionClient) {
    return `INV-${this.pad(await this.nextValue('INV', tx), 4)}`;
  }
  /** APP-2026-0001 (yearly sequence) */
  async application(tx?: Prisma.TransactionClient) {
    const y = new Date().getUTCFullYear();
    return `APP-${y}-${this.pad(await this.nextValue(`APP-${y}`, tx), 4)}`;
  }
  /** DOC-000001 */
  async document(tx?: Prisma.TransactionClient) {
    return `DOC-${this.pad(await this.nextValue('DOC', tx), 6)}`;
  }
  /** TXN-000001 */
  async transaction(tx?: Prisma.TransactionClient) {
    return `TXN-${this.pad(await this.nextValue('TXN', tx), 6)}`;
  }
  /** SUB-EX-000001 */
  async execution(tx?: Prisma.TransactionClient) {
    return `SUB-EX-${this.pad(await this.nextValue('SUB-EX', tx), 6)}`;
  }
  /** SUB-DE-000001 */
  async dayEnd(tx?: Prisma.TransactionClient) {
    return `SUB-DE-${this.pad(await this.nextValue('SUB-DE', tx), 6)}`;
  }
  /** REC-2026-0001 */
  async reconBatch(tx?: Prisma.TransactionClient) {
    const y = new Date().getUTCFullYear();
    return `REC-${y}-${this.pad(await this.nextValue(`REC-${y}`, tx), 4)}`;
  }
  /** CRS-2026-0001 */
  async companySubmission(tx?: Prisma.TransactionClient) {
    const y = new Date().getUTCFullYear();
    return `CRS-${y}-${this.pad(await this.nextValue(`CRS-${y}`, tx), 4)}`;
  }
  /** PF-001 style: caller supplies prefix */
  async generic(prefix: string, width = 3, tx?: Prisma.TransactionClient) {
    return `${prefix}-${this.pad(await this.nextValue(prefix, tx), width)}`;
  }
}

@Global()
@Module({ providers: [ReferenceService], exports: [ReferenceService] })
export class ReferenceModule {}
