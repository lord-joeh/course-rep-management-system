import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().port().default(5000),
  API_PREFIX: Joi.string().default('api'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),

  // Database (PostgreSQL)
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),

  // Cache (Redis)
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_KEY_PREFIX: Joi.string().default('cr:'),

  // JWT Configuration
  JWT_ACCESS_SECRET: Joi.string().min(32).default('9e34ec3297967097438235cdefca879907a6601e22ce545eaba75deb2cb391c678f3cd5ebeb5be748ba1117877d7ccad8d21690f59975be66bf5cf7ad9d5e67d'),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).default('3402272422af203f1660a1e246b61ef96a53b7b80064535f1aca03b6da7ae70ecfb7e3ad8b821479f7ca913bd973b33600c06e170effe7f8d3d0add1655558f5'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // SMTP / Brevo Mailer
  SMTP_HOST: Joi.string().default('smtp-relay.brevo.com'),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_SENDER: Joi.string().email().default('dev.styles24@gmail.com'),

  // Arkesel SMS
  ARKESEL_API_KEY: Joi.string().allow('').optional(),
  ARKESEL_SENDER_ID: Joi.string().default('COURSE REP'),
  ARKESEL_BASE_URL: Joi.string().uri().default('https://sms.arkesel.com/sms/api?action=send-sms&'),

  // Google OAuth
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_REDIRECT_URI: Joi.string().uri().default('http://localhost:5000/api/google/callback'),
});
