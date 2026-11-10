import { Global, Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { Accounts } from './accounts.service.js';
import { AUTH_KEYS, AuthTokens, remoteAuthKeys } from './auth-tokens.js';

/** Sign-up and sign-in happen in Neon Auth. The API only checks its tokens. */
@Global()
@Module({
  providers: [
    { provide: AUTH_KEYS, inject: [ConfigService], useFactory: remoteAuthKeys },
    AuthTokens,
    Accounts,
  ],
  exports: [AuthTokens, Accounts],
})
export class AuthModule {}
