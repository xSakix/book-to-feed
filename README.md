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

**M0 — project skeleton.** The shell, routing, theming, test harness, CI and
Cloudflare deployment are in place. Every feature route renders a placeholder
that links to the issue implementing it. Importing a book comes next, in M1.

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
