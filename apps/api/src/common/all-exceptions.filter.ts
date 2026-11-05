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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();
    const { status, code, message, details } = this.describe(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, requestId: request.id }, 'unhandled error');
    }

    const body: ErrorBody = {
      error: { code, message, details, requestId: String(request.id ?? '') },
    };
    response.status(status).json(body);
  }

  private describe(exception: unknown) {
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
        message: 'Too many requests. Please slow down.',
        details: [],
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODE_BY_STATUS[status];
      if (code) return { status, code, message: exception.message, details: [] };
    }
    return {
      status: ERROR_STATUS.INTERNAL,
      code: 'INTERNAL' as const,
      message: 'Something went wrong on our side.',
      details: [],
    };
  }
}
