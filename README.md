# book to feed

Drop in an EPUB, read it as a social feed. Every chapter becomes an account with
its own feed, every paragraph-cluster becomes a post, and reaching the end of a
chapter hands you the next one as a friend request.

**Everything runs in your browser.** The book is unzipped, parsed, segmented and
stored on your device. There is no backend, no account, and nothing is uploaded —
a claim the end-to-end suite actually asserts by failing the build if the app
requests anything from a third-party origin.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design, and the
[issue tracker](https://github.com/xSakix/book-to-feed/issues) for the milestone
breakdown (M0–M5).

## Status

**M2 — the segmentation engine.** An imported book is now cut into posts:
blocks are extracted from the sanitised markup, then grouped by a scored break
decision that tries to end every post on a beat. Headings, images, tables and
scene breaks stand alone; dialogue exchanges are never split; an over-long
paragraph is divided at sentence boundaries.

The feed UI itself is next, in M3 — the posts exist in storage and their counts
show on the book profile, but reading a chapter still shows a placeholder.

## Getting started

```bash
npm install
npm run dev
```

| Command                 | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `npm run dev`           | Dev server with HMR                                   |
| `npm run build`         | Typecheck, then build a static `dist/`                |
| `npm run preview`       | Serve the production build on :4173                   |
| `npm run typecheck`     | `tsc -b --noEmit`                                     |
| `npm run lint`          | ESLint (type-aware)                                   |
| `npm run format`        | Prettier, including Tailwind class sorting            |
| `npm test`              | Vitest unit tests                                     |
| `npm run test:coverage` | Unit tests with coverage over `src/core`              |
| `npm run test:e2e`      | Playwright, desktop and mobile viewports              |
| `npm run size`          | Gzipped bundle budget check                           |
| `npm run deploy`        | `wrangler deploy` to Cloudflare Workers Static Assets |

### Tuning the segmenter

The scoring weights in `src/core/segment/segment.ts` are an informed starting
point, not truth. `tests/unit/golden.test.ts` is what makes changing them safe:
it snapshots the shape of every post per genre and prints a metrics table
(mean/median length, sentence-end rate) on every run. A snapshot diff there is
the point — read it, decide whether the new cuts read better, then accept it
with `npm test -- -u`.

### Fixtures

The test suite builds its own EPUBs (`tests/fixtures/build.ts`) rather than
committing real books. That covers hostile markup, malformed XML and DRM markers
better than any real book would. Real public-domain books are still needed for
the M2 segmentation golden files — prose shape is the one thing a synthetic
fixture cannot fake.

### Running the e2e suite

Playwright downloads its own browsers by default. In a sandbox that already has
one provisioned, point at it instead:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

## Layout

```
src/
  app/         shell, routing, theme, global store
  features/    library · feed · profile · graph · social · settings
  core/        framework-free logic: epub · sanitize · db · segment
  workers/     the import worker (M1)
  ui/          design tokens and shared primitives
tests/
  unit/ e2e/ fixtures/ golden/
```

## Deployment

Static assets on Cloudflare Workers, with SPA fallback so deep links survive a
reload. Security headers — including the CSP that keeps a malicious EPUB from
executing script in the app's origin — live in [`public/_headers`](./public/_headers).

Deploys run from `.github/workflows/deploy.yml` on merge to `main` and need two
repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
