import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

type PrincipalRequest = {
  method: string;
  rider?: { id: string };
  driver?: { id: string };
  admin?: { id: string };
};

@Injectable()
export class FeedbackRateLimitGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();

  canActivate(context: ExecutionContext): boolean {
    // Run AFTER the role-specific JWT guard. Identity never comes from a body/header.
    const req = context.switchToHttp().getRequest<PrincipalRequest>();
    const actor = req.rider
      ? `rider:${req.rider.id}`
      : req.driver
        ? `driver:${req.driver.id}`
        : req.admin
          ? `admin:${req.admin.id}`
          : null;
    if (!actor) throw new UnauthorizedException('Authentication is required');
    const write = req.method !== 'GET';
    const key = `${actor}:${write ? 'write' : 'read'}`;
    const now = Date.now();
    let window = this.windows.get(key);
    if (!window || window.until <= now) {
      if (this.windows.size >= 10000) {
        for (const [entry, value] of this.windows)
          if (value.until <= now) this.windows.delete(entry);
        if (!this.windows.has(key) && this.windows.size >= 10000) this.reject();
      }
      window = { count: 0, until: now + 60000 };
      this.windows.set(key, window);
    }
    if (window.count >= (write ? 20 : 120)) this.reject();
    window.count++;
    return true;
  }

  private reject(): never {
    throw new HttpException(
      'Too many feedback requests; try again shortly',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
