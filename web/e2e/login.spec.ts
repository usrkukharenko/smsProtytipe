import { expect, test } from "@playwright/test";

/**
 * Full happy-path SMS login flow.
 *
 * Skips itself if `/api/health` reports Postgres/Redis are unreachable, so
 * CI can run it without failing when infra is intentionally absent.
 */

const PHONE_INPUT_VALUE = "+7 (999) 123-45-67";
const NORMALIZED_PHONE = "+79991234567";
const GATEWAY_TOKEN =
  process.env.GATEWAY_TOKEN ?? "playwright_gateway_token";

async function backendReady(baseURL: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseURL}/api/health`);
    if (!res.ok) return false;
    const body = (await res.json()) as {
      db?: string;
      redis?: string;
    };
    return body.db === "ok" && body.redis === "ok";
  } catch {
    return false;
  }
}

test.describe("SMS login flow", () => {
  test("happy path: phone -> code -> success", async ({ page, baseURL }) => {
    const url = baseURL ?? "http://localhost:3000";
    test.skip(
      !(await backendReady(url)),
      "Postgres/Redis not reachable via /api/health — skipping e2e"
    );

    // ---- Step 1: phone entry --------------------------------------------
    await page.goto("/");
    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill(PHONE_INPUT_VALUE);

    // ---- Step 2: submit phone -------------------------------------------
    await page.getByRole("button", { name: /Получить код/i }).click();
    await page.waitForURL(/\/verify$/);

    // ---- Step 3: fetch the queued SMS task via gateway API --------------
    const pending = await page.request.get(
      `${url}/api/sms/pending?max=10`,
      { headers: { authorization: `Bearer ${GATEWAY_TOKEN}` } }
    );
    expect(pending.ok()).toBeTruthy();
    const { tasks } = (await pending.json()) as {
      tasks: { phone: string; text: string }[];
    };
    const task = tasks.find((t) => t.phone === NORMALIZED_PHONE);
    expect(task).toBeDefined();
    const codeMatch = task!.text.match(/(\d{6})/);
    expect(codeMatch).not.toBeNull();
    const code = codeMatch![1];

    // ---- Step 4: enter code on /verify ----------------------------------
    const codeInputs = page.locator('input[inputmode="numeric"]');
    await codeInputs.first().fill(code);

    // ---- Step 5: arrive on /success -------------------------------------
    await page.waitForURL(/\/success$/);
    await expect(page).toHaveURL(/\/success$/);
  });

  test("phone page renders and validates input", async ({ page }) => {
    // This smoke test does NOT need backend infra — it only checks the form.
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Вход/i })
    ).toBeVisible();

    const phoneInput = page.locator('input[type="tel"]');
    const submit = page.getByRole("button", { name: /Получить код/i });

    await expect(submit).toBeDisabled();
    await phoneInput.fill(PHONE_INPUT_VALUE);
    await expect(submit).toBeEnabled();
  });
});
