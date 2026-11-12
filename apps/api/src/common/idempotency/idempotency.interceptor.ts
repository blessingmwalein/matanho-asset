import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Honours the `Idempotency-Key` header on mutating requests (UAT NFR-004: double-click and
 * interrupted-request resilience). A repeated key from the same caller replays the first
 * response instead of executing the action twice. A key still in flight returns 409.
 * Failed requests release the key so the caller can retry.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(ec: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ec.switchToHttp().getRequest<Request>();
    const res = ec.switchToHttp().getResponse<Response>();
    const key = req.headers['idempotency-key'];
    if (!MUTATING.has(req.method) || typeof key !== 'string' || key.length < 8 || key.length > 128) {
      return next.handle();
    }

    const userId = req.ctx?.userId ?? `anon:${req.ip ?? 'unknown'}`;
    const path = req.originalUrl.split('?')[0] ?? req.path;

    try {
      await this.prisma.idempotencyRecord.create({ data: { key, userId, method: req.method, path, state: 'PENDING' } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.idempotencyRecord.findUnique({ where: { key_userId: { key, userId } } });
        if (existing?.state === 'DONE') {
          res.status(existing.statusCode ?? 200);
          res.setHeader('Idempotent-Replay', 'true');
          return from([existing.responseBody ?? null]);
        }
        throw new ConflictException('This request is already being processed. Please wait a moment.');
      }
      throw e;
    }

    return next.handle().pipe(
      mergeMap(async (body) => {
        // Streams (file downloads) are never stored/replayed.
        const storable = !(body instanceof StreamableFile) && !Buffer.isBuffer(body);
        await this.prisma.idempotencyRecord
          .update({
            where: { key_userId: { key, userId } },
            data: {
              state: 'DONE',
              statusCode: res.statusCode,
              responseBody: storable ? (JSON.parse(JSON.stringify(body ?? null)) as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
          })
          .catch(() => undefined);
        return body;
      }),
      catchError((err) =>
        from(this.prisma.idempotencyRecord.delete({ where: { key_userId: { key, userId } } }).catch(() => undefined)).pipe(
          mergeMap(() => throwError(() => err)),
        ),
      ),
    );
  }
}
