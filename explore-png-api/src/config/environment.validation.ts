import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  HOST: Joi.string().default('0.0.0.0'),

  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  CORS_ORIGINS: Joi.string().default(
    'http://localhost:3000,http://localhost:8081,http://localhost:19006',
  ),

  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),

  ADMIN_JWT_SECRET: Joi.string().min(64).required(),
  RIDER_JWT_SECRET: Joi.string().min(64).required(),
  DRIVER_JWT_SECRET: Joi.string().min(64).required(),
});
