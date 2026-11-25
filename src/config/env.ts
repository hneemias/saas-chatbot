import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform((v) => parseInt(v, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Evolution API
  EVOLUTION_API_URL: z.string().url().default('https://workflows.hneemias.cloud'),
  EVOLUTION_API_KEY: z.string().min(1).default('sua_master_key'),

  // Supabase
  SUPABASE_URL: z.string().url().default('https://seu-projeto.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default('sua_service_role_key'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform((v) => parseInt(v, 10)),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0').transform((v) => parseInt(v, 10)),

  // Gemini AI
  GEMINI_API_KEY: z.string().min(1).default('sua_gemini_key'),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  GEMINI_EMBEDDING_DIMENSIONS: z.string().default('1536').transform((v) => parseInt(v, 10)),

  // Admin Panel API Auth (opcional)
  ADMIN_API_KEY: z.string().optional(),

  // Multivozes (opcional)
  MULTIVOZES_API_URL: z.string().optional(),
  MULTIVOZES_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
