import express, { type Express } from 'express';
import request from 'supertest';
import { createApiSecurityHeadersMiddleware } from './security-headers';

function createTestApplication(nodeEnv: string): Express {
  const application = express();

  application.use(createApiSecurityHeadersMiddleware(nodeEnv));

  application.get('/security-test', (_request, response) => {
    response.status(200).json({
      status: 'ok',
    });
  });

  return application;
}

describe('API security headers', () => {
  it('sets restrictive browser security headers in production', async () => {
    const response = await request(createTestApplication('production'))
      .get('/security-test')
      .expect(200);

    expect(response.get('Content-Security-Policy')).toContain(
      "default-src 'none'",
    );
    expect(response.get('Content-Security-Policy')).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.get('X-Frame-Options')).toBe('DENY');
    expect(response.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.get('X-Powered-By')).toBeUndefined();
  });

  it('retains cross-origin API response compatibility', async () => {
    const response = await request(createTestApplication('production'))
      .get('/security-test')
      .expect(200);

    expect(response.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
  });

  it('enables HSTS only in production', async () => {
    const productionResponse = await request(
      createTestApplication('production'),
    )
      .get('/security-test')
      .expect(200);

    const developmentResponse = await request(
      createTestApplication('development'),
    )
      .get('/security-test')
      .expect(200);

    expect(productionResponse.get('Strict-Transport-Security')).toMatch(
      /max-age=31536000/i,
    );
    expect(productionResponse.get('Strict-Transport-Security')).toMatch(
      /includeSubDomains/i,
    );
    expect(
      developmentResponse.get('Strict-Transport-Security'),
    ).toBeUndefined();
  });
});
