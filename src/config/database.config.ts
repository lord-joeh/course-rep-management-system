import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  name: string;
  ssl: boolean;
  logging: boolean;
}

export default registerAs(
  'database',
  (): DatabaseConfig => ({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    pass: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'course_rep_db',
    ssl: process.env.DB_SSL === 'true',
    logging: process.env.NODE_ENV === 'development',
  }),
);

