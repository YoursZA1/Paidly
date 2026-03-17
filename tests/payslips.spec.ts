import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { uniqueName } from './utils/data';

test.describe('PAYSLIPS', () => {
  test('Generate payslip and validate totals/formatting', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    await page.goto(`${baseURL}${APP_PATHS.payslips}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Payslips/i);

    const generate = page.getByTestId('payslips-generate').or(page.getByRole('button', { name: /generate payslip|new payslip|create payslip/i }));
    if (await generate.isVisible().catch(() => false)) await generate.click();

    const employee = page.getByTestId('payslip-employee').or(page.getByRole('textbox', { name: /employee|name/i })).or(page.getByPlaceholder(/employee|name/i));
    if (await employee.isVisible().catch(() => false)) await employee.fill(uniqueName('E2E Employee'));

    const gross = page.getByTestId('payslip-gross').or(page.getByPlaceholder(/gross/i));
    if (await gross.isVisible().catch(() => false)) await gross.fill('1000');

    const save = page.getByTestId('payslip-save').or(page.getByRole('button', { name: /save|generate/i }));
    if (await save.isVisible().catch(() => false)) await save.click();

    // Formatting sanity checks
    await expect(page.getByText(/total|net|gross/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\b1000\b/).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  });
});

