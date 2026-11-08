import helmet from 'helmet';

const ONE_YEAR_IN_SECONDS = 31_536_000;

export function createApiSecurityHeadersMiddleware(nodeEnv: string) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
    referrerPolicy: {
      policy: 'no-referrer',
    },
    strictTransportSecurity:
      nodeEnv === 'production'
        ? {
            maxAge: ONE_YEAR_IN_SECONDS,
            includeSubDomains: true,
            preload: false,
          }
        : false,
    xFrameOptions: {
      action: 'deny',
    },
  });
}
