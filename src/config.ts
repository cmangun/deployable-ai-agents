/**
 * Configuration Module
 *
 * Environment-based configuration with validation.
 */

import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  maxAgentSteps: z.coerce.number().default(10),
  agentTimeoutMs: z.coerce.number().default(30000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  return configSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    maxAgentSteps: process.env.MAX_AGENT_STEPS,
    agentTimeoutMs: process.env.AGENT_TIMEOUT_MS,
    logLevel: process.env.LOG_LEVEL,
  });
}

export const config = loadConfig();
