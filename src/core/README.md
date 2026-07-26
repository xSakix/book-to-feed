# `src/core`

Framework-free logic — no React, no DOM rendering. Everything here must be
callable from a Web Worker, because the import pipeline runs in one.

| Directory   | Contents                                                            | Milestone |
| ----------- | ------------------------------------------------------------------- | --------- |
| `epub/`     | container/OPF/NCX/nav parsing, resource resolution                  | M1        |
| `sanitize/` | DOMPurify config, URL rewriting                                     | M1        |
| `db/`       | IndexedDB schema, migrations, queries                               | M1        |
| `segment/`  | block extraction and the segmentation engine — the most-tested code | M2        |

Test coverage is reported for this directory only; the UI is covered by the
end-to-end suite instead.
