import {
  ExecutionContext,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { FeedbackRateLimitGuard } from './feedback-rate-limit.guard';

function context(id?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', ...(id ? { rider: { id } } : {}) }),
    }),
  } as unknown as ExecutionContext;
}
describe('FeedbackRateLimitGuard', () => {
  afterEach(() => jest.restoreAllMocks());
  it('requires an authenticated principal', () => {
    expect(() => new FeedbackRateLimitGuard().canActivate(context())).toThrow(
      UnauthorizedException,
    );
  });
  it('limits one account without blocking another, and resets after the window', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const guard = new FeedbackRateLimitGuard();
    for (let n = 0; n < 20; n++)
      expect(guard.canActivate(context('a'))).toBe(true);
    expect(() => guard.canActivate(context('a'))).toThrow(HttpException);
    expect(guard.canActivate(context('b'))).toBe(true);
    clock.mockReturnValue(61001);
    expect(guard.canActivate(context('a'))).toBe(true);
  });
});
