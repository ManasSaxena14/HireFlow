import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
  loginSchema,
  type LoginInput,
  registerSchema,
  type RegisterInput,
  resetPasswordSchema,
  type ResetPasswordInput,
  verifyEmailSchema,
  type VerifyEmailInput,
} from '@hireflow/shared';
import type { CookieOptions, Response } from 'express';
import {
  type AppRequest,
  Authenticated,
  CurrentUser,
  Public,
  type RequestUser,
} from '../common/access.js';
import { unauthenticated } from '../common/domain-error.js';
import { AuthRateLimit } from '../common/rate-limit.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ConfigService } from '../config/config.service.js';
import { AuthService, type RequestMeta, type Session } from './auth.service.js';
import { REFRESH_COOKIE, REFRESH_TOKEN_TTL_MS } from './tokens.js';

const metaOf = (request: AppRequest): RequestMeta => ({
  ip: request.ip ?? null,
  userAgent: request.headers['user-agent'] ?? null,
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Public()
  @AuthRateLimit()
  register(@Body(new ZodPipe(registerSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Post('login')
  @Public()
  @AuthRateLimit()
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.startSession(await this.auth.login(body, metaOf(request)), response);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(@Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    const token = this.readCookie(request);
    if (!token) throw unauthenticated();
    try {
      return this.startSession(await this.auth.refresh(token, metaOf(request)), response);
    } catch (error) {
      response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @Authenticated()
  @HttpCode(204)
  async logout(@Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.readCookie(request));
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Post('logout-all')
  @Authenticated()
  @HttpCode(204)
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(user.id);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Post('verify-email')
  @Public()
  @AuthRateLimit()
  @HttpCode(200)
  async verifyEmail(@Body(new ZodPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    await this.auth.verifyEmail(body.token);
    return { verified: true };
  }

  @Post('forgot-password')
  @Public()
  @AuthRateLimit()
  @HttpCode(200)
  async forgotPassword(@Body(new ZodPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    await this.auth.forgotPassword(body.email);
    return { message: 'If this account exists, we sent a link to it.' };
  }

  @Post('reset-password')
  @Public()
  @AuthRateLimit()
  @HttpCode(200)
  async resetPassword(@Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.auth.resetPassword(body);
    return { reset: true };
  }

  private startSession(session: Session, response: Response) {
    response.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private readCookie(request: AppRequest): string | undefined {
    return (request.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  }

  private cookieOptions(): CookieOptions {
    const { COOKIE_DOMAIN, COOKIE_SECURE } = this.config.env;
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/api/v1/auth',
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    };
  }
}
