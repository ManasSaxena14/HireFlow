import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ERROR_STATUS, type ErrorBody, type ErrorCode } from '@hireflow/shared';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { DomainError } from './domain-error.js';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

// PostgreSQL cannot store these letters, such as the empty character \u0000.
const BAD_TEXT_CODES = new Set(['22021', '22P05']);

const friendlyMessage = (message: string) => {
  if (message.includes('JSON')) return 'We could not read this request.';
  if (message.startsWith('Cannot ')) return 'This page is not available.';
  if (message.includes('uuid is expected')) return 'This link is not valid.';
  return message;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();
    const { status, code, message, details } = this.describe(exception, request);

    if (status >= 500) {
      this.logger.error({ err: exception, requestId: request.id }, 'unhandled error');
    }

    const body: ErrorBody = {
      error: { code, message, details, requestId: String(request.id ?? '') },
    };
    response.status(status).json(body);
  }

  private describe(exception: unknown, request: Request) {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: 429,
        code: 'RATE_LIMITED' as const,
        message: 'Too many tries. Please wait a minute and try again.',
        details: [],
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 413 && !request.is('multipart/form-data')) {
        return {
          status,
          code: 'VALIDATION_ERROR' as const,
          message: 'This is too long. Please shorten it and try again.',
          details: [],
        };
      }
      if (status === 413) {
        const message = 'This file is too big. The limit is 5 MB.';
        return {
          status,
          code: 'VALIDATION_ERROR' as const,
          message,
          details: [{ path: 'resume', message }],
        };
      }
      const code = CODE_BY_STATUS[status];
      if (code) return { status, code, message: friendlyMessage(exception.message), details: [] };
    }
    if (BAD_TEXT_CODES.has((exception as { code?: string })?.code ?? '')) {
      return {
        status: 400,
        code: 'VALIDATION_ERROR' as const,
        message: 'Some of this text has letters we cannot save. Please remove them.',
        details: [],
      };
    }
    return {
      status: ERROR_STATUS.INTERNAL,
      code: 'INTERNAL' as const,
      message: 'Something went wrong. Please try again.',
      details: [],
    };
  }
}
