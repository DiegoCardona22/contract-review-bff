import { z } from "zod";

/**
 * Config is parsed once at boot and fails loudly if wrong.
 *
 * A missing upstream URL should crash the process on startup, not surface as a
 * confusing `fetch failed` on the first user request an hour later.
 */
const Env = z.object({
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default("info"),

  DOCUMENTS_URL: z.string().url().default("http://localhost:4001"),
  USERS_URL: z.string().url().default("http://localhost:4002"),
  ANALYSIS_URL: z.string().url().default("http://localhost:4003"),

  /**
   * Per-attempt timeouts, tuned per upstream rather than shared.
   *
   * `analysis` gets the longest budget because risk scoring is genuinely slow;
   * giving it the same 300ms as a user lookup would mean degrading a healthy
   * service constantly. The others are fast, so a long timeout there would only
   * delay the inevitable.
   */
  DOCUMENTS_TIMEOUT_MS: z.coerce.number().default(500),
  USERS_TIMEOUT_MS: z.coerce.number().default(300),
  ANALYSIS_TIMEOUT_MS: z.coerce.number().default(800),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Env.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  const e = parsed.data;

  return {
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    upstreams: {
      documents: { baseUrl: e.DOCUMENTS_URL, timeoutMs: e.DOCUMENTS_TIMEOUT_MS },
      users: { baseUrl: e.USERS_URL, timeoutMs: e.USERS_TIMEOUT_MS },
      analysis: { baseUrl: e.ANALYSIS_URL, timeoutMs: e.ANALYSIS_TIMEOUT_MS },
    },
    retry: { maxRetries: 2, baseDelayMs: 50, maxDelayMs: 400 },
  } as const;
}
