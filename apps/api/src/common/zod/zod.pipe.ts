import { applyDecorators, BadRequestException, PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';

export interface FieldErrors {
  [path: string]: string;
}

export function flattenZodError(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

/**
 * Validates and transforms a request part with a (shared) zod schema.
 * Usage:  `@Body(new ZodPipe(schema)) body: z.infer<typeof schema>`
 *         `@Query(new ZodPipe(listQuerySchema)) q: ListQuery`
 */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        errors: flattenZodError(result.error),
      });
    }
    return result.data;
  }
}

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  } catch {
    return { type: 'object' };
  }
}

/** Documents a zod request body in Swagger. Combine with `@Body(new ZodPipe(schema))`. */
export const ApiZodBody = (schema: z.ZodType) => applyDecorators(ApiBody({ schema: jsonSchemaOf(schema) as never }));

/** Documents the standard list query (page, pageSize, q, sort, order). */
export const ApiListQuery = () =>
  applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number }),
    ApiQuery({ name: 'pageSize', required: false, type: Number }),
    ApiQuery({ name: 'q', required: false, type: String }),
    ApiQuery({ name: 'sort', required: false, type: String }),
    ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] }),
  );
