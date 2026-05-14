import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      JWT_SECRET: "playwright_secret_min_16_chars_long",
      GATEWAY_TOKEN: "playwright_gateway_token",
      ALTCHA_HMAC_KEY: "playwright_altcha_key",
      DATABASE_URL: "postgres://x:x@localhost:5432/x",
      REDIS_URL: "redis://localhost:6379",
    },
  },
});
