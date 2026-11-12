import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';

/**
 * Uniform JSON error shape: { statusCode, message, errors? }.
 * 401/403 are recorded as audit events (UAT AUD-003: denials are recorded).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');
  constructor(private readonly audit: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errors: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else {
        const b = body as { message?: string | string[]; errors?: Record<string, string> };
        message = b.message ?? exception.message;
        errors = b.errors;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'A record with these details already exists.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found.';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        message = 'This record is referenced by other records.';
      } else {
        this.log.error(`${req.method} ${req.url} → Prisma ${exception.code}: ${exception.message}`);
      }
    } else {
      this.log.error(`${req.method} ${req.url} → ${(exception as Error)?.stack ?? exception}`);
    }

    if (status === HttpStatus.FORBIDDEN || status === HttpStatus.UNAUTHORIZED) {
      void this.audit.record({
        ctx: req.ctx ?? null,
        entityType: 'Access',
        action: status === HttpStatus.FORBIDDEN ? 'ACCESS_DENIED' : 'UNAUTHENTICATED_REQUEST',
        metadata: { method: req.method, path: req.originalUrl?.split('?')[0], reason: Array.isArray(message) ? message.join('; ') : message },
        ip: req.ip,
      });
    }

    res.status(status).json({ statusCode: status, message, ...(errors ? { errors } : {}) });
  }
}
