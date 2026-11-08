import { Global, Module } from '@nestjs/common';
import { minutes, ThrottlerModule } from '@nestjs/throttler';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'auth',
        ttl: minutes(1),
        limit: 5,
        blockDuration: minutes(5),
      },
    ]),
  ],
  exports: [ThrottlerModule],
})
export class AuthRateLimitModule {}
