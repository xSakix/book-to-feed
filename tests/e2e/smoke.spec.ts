import { expect, test } from '@playwright/test';

test('the shell loads and navigation works', async ({ page }) => {
  await page.goto('/');
  // An empty library, since each test starts from a fresh browser context.
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();

  await page.getByRole('link', { name: 'Import', exact: true }).click();
  await expect(page).toHaveURL(/\/import$/);
  await expect(page.getByRole('heading', { name: 'Import a book' })).toBeVisible();
});

test('a deep-linked route survives a reload (SPA fallback)', async ({ page }) => {
  await page.goto('/b/abc123/c/4');
  await expect(page.getByRole('heading', { name: 'Chapter feed' })).toBeVisible();
  await expect(page.getByText('chapter: 4')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chapter feed' })).toBeVisible();
});

test('an unknown route renders the not-found screen', async ({ page }) => {
  await page.goto('/definitely-not-a-route');
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
});

test('the theme choice applies and persists across a reload', async ({ page }) => {
  await page.goto('/settings');

  await page.getByRole('radio', { name: 'Sepia' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
});

/**
 * The privacy claim — "your books never leave this device" — has to be literally
 * true and verifiable, so it gets a test rather than a paragraph in a README.
 * No CDN fonts, no analytics, no remote anything.
 */
test('nothing is requested from a third-party origin', async ({ page, baseURL }) => {
  const ownOrigin = new URL(baseURL!).origin;
  const external: string[] = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== ownOrigin) external.push(request.url());
  });

  await page.goto('/');
  await page.goto('/settings');

  expect(external).toEqual([]);
});
