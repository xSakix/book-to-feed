# Fixtures

Public-domain EPUBs used by the unit and golden-file suites (#9, #24). The set
needs to cover the shapes that break naive assumptions:

- a novel (the baseline case)
- a poetry collection (verse blocks, short lines)
- a play (dialogue-dominant, speaker labels)
- a non-fiction book with tables and footnotes
- an EPUB 2 file (NCX rather than a nav document)
- an RTL file, and a CJK file (#45)
- a fixed-layout file (#44)
- a hostile file: script tags, event handlers, `javascript:` links, a remote image (#14)

Sources: Project Gutenberg and Standard Ebooks. Record provenance here as files
are added.
