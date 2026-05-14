import { expect, test } from "@playwright/test";

/**
 * Full happy-path SMS login flow.
 *
 * Why this is marked test.fixme:
 *   /api/auth/request-code requires a valid Altcha solution. Altcha runs in
 *   the browser as a proof-of-work challenge; there is no documented "dev
 *   bypass" in this project, and solving it from a Playwright test is fragile.
 *   Once an `ALTCHA_DEV_BYPASS` (or similar) escape hatch is wired into
 *   lib/altcha.ts for the test env, replace the `test.fixme` below with the
 *   real assertions inside this function — the rest of the flow is sketched
 *   out and ready.
 *
 * The test also short-circuits if `/api/health` reports the backing services
 * (Postgres + Redis) are unreachable, so CI can run it without failing when
 * the infra is intentionally absent.
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

    // Captcha (Altcha) currently has no documented test bypass. Until one
    // exists, the rest of this flow is illustrative only.
    test.fixme(
      true,
      "Altcha captcha has no dev bypass — wire one in lib/altcha.ts and " +
        "remove this fixme to enable the full e2e."
    );

    // ---- Step 1: phone entry --------------------------------------------
    await page.goto("/");
    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill(PHONE_INPUT_VALUE);

    // ---- Step 2: (would solve / bypass altcha here) ----------------------
    // e.g. await page.evaluate(() => {
    //   window.__altchaSolution = "dev-bypass-token";
    // });

    // ---- Step 3: submit phone -------------------------------------------
    await page.getByRole("button", { name: /Получить код/i }).click();
    await page.waitForURL(/\/verify$/);

    // ---- Step 4: fetch the queued SMS task via gateway API --------------
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

    // ---- Step 5: enter code on /verify ---------------------------------
    const codeInputs = page.locator('input[inputmode="numeric"]');
    await codeInputs.first().fill(code);

    // ---- Step 6: arrive on /success ------------------------------------
    await page.waitForURL(/\/success$/);
    await expect(page).toHaveURL(/\/success$/);
  });

  test("phone page renders and validates input", async ({ page, baseURL }) => {
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
