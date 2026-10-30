# Self-hosted fonts

These files are the only font assets the site serves. They are vendored into
`public/fonts/` so the browser never contacts a third-party font CDN at
runtime. `public/fonts/` is unhashed, so the cache policy is set separately in
`public/_headers` (Step 0.6).

| File | Family | Role | Weight | Subset |
|---|---|---|---|---|
| `instrument-serif-latin-400-normal.woff2` | Instrument Serif | Display | 400 | latin |
| `instrument-serif-latin-400-italic.woff2` | Instrument Serif | Display italic | 400 | latin |
| `geist-latin-wght-normal.woff2` | Geist | Body | 100–900 variable | latin |
| `jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono | Data and code | 100–800 variable | latin |

The files are copied from the `@fontsource/instrument-serif`,
`@fontsource-variable/geist`, and `@fontsource-variable/jetbrains-mono`
development packages. Those packages are build-time sources only; no code
imports them and nothing from them ships to the browser beyond the woff2 files
in this directory. Refresh a file by reinstalling the package and copying the
matching `files/*-latin-*.woff2` asset again.

`@font-face` declarations and metric-matched local fallbacks live in
`src/styles/base.css`. Only the Geist body face and the Instrument Serif roman
face are preloaded. The declarations use the latin `unicode-range` published by
Fontsource; the latin-ext, Cyrillic, Greek, and Vietnamese subsets are not
included because release 1 only publishes English prose.

## Licence

All three families are licensed under the SIL Open Font License 1.1. The full
licences are stored next to the font files:

- `OFL-InstrumentSerif.txt` — Copyright 2022 The Instrument Serif Project Authors
- `OFL-Geist.txt` — Copyright 2024 The Geist Project Authors
- `OFL-JetBrainsMono.txt` — Copyright 2020 The JetBrains Mono Project Authors

The colophon page credits the families when it lands.
