import { expect, test } from '@playwright/test';
import { buildEpub, simpleBook, TINY_PNG } from '../fixtures/build';

/**
 * The import path in a real browser.
 *
 * This is where the parts the unit suite cannot reach get proven: the unzip
 * Web Worker, real Blob storage in real IndexedDB, and persistence across a
 * reload.
 */

const asBuffer = (bytes: Uint8Array) => Buffer.from(bytes);

test('imports a book and shows it in the library', async ({ page }) => {
  await page.goto('/import');

  await page.setInputFiles('input[type="file"]', {
    name: 'quiet-house.epub',
    mimeType: 'application/epub+zip',
    buffer: asBuffer(simpleBook()),
  });

  await expect(page.getByRole('heading', { name: 'Your feed is ready' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open The Quiet House/ })).toBeVisible();

  await page.getByRole('button', { name: /Open The Quiet House/ }).click();
  await expect(page.getByRole('heading', { name: 'The Quiet House' })).toBeVisible();
  await expect(page.getByRole('link', { name: /An Arrival/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /The Second Night/ })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await expect(page.getByText('Marta Kovac')).toBeVisible();
  await expect(page.getByText('3 chapters', { exact: false })).toBeVisible();
});

test('the imported book survives a reload', async ({ page }) => {
  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', {
    name: 'quiet-house.epub',
    mimeType: 'application/epub+zip',
    buffer: asBuffer(simpleBook()),
  });
  await expect(page.getByRole('heading', { name: 'Your feed is ready' })).toBeVisible();

  await page.goto('/');
  await page.reload();
  await expect(page.getByText('The Quiet House')).toBeVisible();
});

test('re-importing the same file does not duplicate the book', async ({ page }) => {
  const file = {
    name: 'quiet-house.epub',
    mimeType: 'application/epub+zip',
    buffer: asBuffer(simpleBook()),
  };

  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', file);
  await expect(page.getByRole('heading', { name: 'Your feed is ready' })).toBeVisible();

  await page.getByRole('button', { name: 'Import another' }).click();
  await page.setInputFiles('input[type="file"]', file);
  await expect(page.getByRole('heading', { name: 'Already in your library' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('stores a cover as a real Blob and renders it', async ({ page }) => {
  const withCover = buildEpub({
    title: 'Illustrated',
    cover: { filename: 'cover.png', bytes: TINY_PNG },
    chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<h1>One</h1><p>Body text.</p>' }],
  });

  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', {
    name: 'illustrated.epub',
    mimeType: 'application/epub+zip',
    buffer: asBuffer(withCover),
  });
  await expect(page.getByRole('heading', { name: 'Your feed is ready' })).toBeVisible();

  await page.goto('/');
  const cover = page.locator('img').first();
  await expect(cover).toBeVisible();
  // A blob: URL means it came out of IndexedDB as a real Blob, not a data URI.
  await expect(cover).toHaveAttribute('src', /^blob:/);
});

test('inflates in a Web Worker rather than on the main thread', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));

  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', {
    name: 'quiet-house.epub',
    mimeType: 'application/epub+zip',
    buffer: asBuffer(simpleBook()),
  });
  await expect(page.getByRole('heading', { name: 'Your feed is ready' })).toBeVisible();

  // There is an in-thread fallback for environments without workers, and it
  // would pass every other test in this file silently. This is the assertion
  // that catches the fallback being taken by accident.
  expect(workers.some((url) => url.includes('unzip.worker'))).toBe(true);
});

test('refuses a DRM-protected book with an explanation', async ({ page }) => {
  const drm = buildEpub({
    chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>a</p>' }],
    extraFiles: { 'META-INF/rights.xml': '<rights/>' },
  });

  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', {
    name: 'protected.epub',
    mimeType: 'application/epub+zip',
    buffer: asBuffer(drm),
  });

  await expect(page.getByRole('alert')).toContainText('protected by DRM');
  await expect(page.getByRole('alert')).toContainText('does not remove DRM');
});

test('refuses a file that is not an EPUB', async ({ page }) => {
  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', {
    name: 'notes.epub',
    mimeType: 'application/epub+zip',
    buffer: Buffer.from('just some text, definitely not a zip archive'),
  });

  await expect(page.getByRole('alert')).toContainText('not a readable EPUB');
});

test('importing a book makes no network requests', async ({ page, baseURL }) => {
  const ownOrigin = new URL(baseURL!).origin;
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'blob:' && url.protocol !== 'data:' && url.origin !== ownOrigin) {
      external.push(request.url());
    }
  });

  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', {
    name: 'quiet-house.epub',
    mimeType: 'application/epub+zip',
    buffer: asBuffer(simpleBook()),
  });
  await expect(page.getByRole('heading', { name: 'Your feed is ready' })).toBeVisible();

  expect(external).toEqual([]);
});

test('a book with hostile markup imports with the payload neutralised', async ({ page }) => {
  const hostile = buildEpub({
    title: 'Hostile',
    chapters: [
      {
        filename: 'ch1.xhtml',
        title: 'Payload',
        body: `<h1>Payload</h1>
<p onclick="window.__pwned = true">ordinary text</p>
<img src="https://tracker.test/pixel.gif" alt="pixel"/>
<a href="javascript:void(window.__pwned = true)">link</a>`,
      },
    ],
  });

  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', {
    name: 'hostile.epub',
    mimeType: 'application/epub+zip',
    buffer: asBuffer(hostile),
  });
  await expect(page.getByRole('heading', { name: 'Your feed is ready' })).toBeVisible();

  // Nothing executed, and the stored markup carries no payload.
  expect(await page.evaluate(() => '__pwned' in window)).toBe(false);

  const storedHtml = await page.evaluate(async () => {
    const open = indexedDB.open('book-to-feed');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error('open failed'));
    });
    const tx = database.transaction('chapters', 'readonly');
    const all = tx.objectStore('chapters').getAll();
    const rows = await new Promise<{ html: string }[]>((resolve, reject) => {
      all.onsuccess = () => resolve(all.result as { html: string }[]);
      all.onerror = () => reject(new Error('read failed'));
    });
    return rows.map((row) => row.html).join('');
  });

  expect(storedHtml).not.toContain('onclick');
  expect(storedHtml).not.toContain('javascript:');
  expect(storedHtml).not.toContain('tracker.test');
  expect(storedHtml).toContain('ordinary text');
});
