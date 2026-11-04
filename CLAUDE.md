# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Česká slova": a single-page React 18 + Vite 6 app for browsing common Czech nouns letter by letter, with English translations, Wikipedia pictures and speech synthesis. It has no backend, router or state library, and no tests or linter are set up.

## Commands

- `npm run dev`: start the Vite dev server
- `npm run build`: production build into `dist/`
- `npm run preview`: serve the built `dist/`

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the app and deploys it to GitHub Pages (https://jakubm.github.io/abeceda/). The Pages source in the repo settings must be "GitHub Actions". `dist/` is also committed to git, but the deploy builds fresh and never uses it. `vite.config.js` sets `base: './'` so the build works under the `/abeceda/` subpath or straight from the file system. Keep it that way.

## Architecture

- **`src/words.json`** is the whole dataset: an array of `{r, cz, en, k?, x?}`.
  - `r` is the frequency rank (from UD Czech treebanks); the array is in rank order, and "most common first" sorting depends on that order.
  - `en` holds comma-separated English senses.
  - `k`, when present, marks a concrete, picturable word for the "kids" mode. Its value is a single child-friendly English word, which replaces `en` in that mode and drives the picture lookup.
  - `x: 1` excludes a word from the "all" mode. 2061 entries minus 61 excluded gives exactly the "2000 most common nouns" the UI promises, so keep that count in mind when you edit the list.
- **`src/App.jsx`** holds all the UI and logic:
  - The Czech alphabet treats `CH`, `Č`, `Ř`, `Š` and `Ž` as separate letters. Other accented letters are folded into their base letter through `FOLD` / `letterOf`.
  - `MODES` and `BY_LETTER` are precomputed once when the module loads.
  - The selected mode is saved in `localStorage` (`czech-nouns-mode`).
- **`src/images.js`**, `getImage(word)`: fetches thumbnails from the Wikipedia REST summary API. It tries English Wikipedia with the first English sense first, then Czech Wikipedia with the Czech lemma.
  - Results are cached in memory and in `localStorage` under `czech-nouns-img-v2`, misses (`null`) included. Network errors are not cached.
  - In-flight requests are de-duplicated.
  - Bump the cache key if you change the lookup logic, because stale misses would otherwise stick.
  - `Picture` loads lazily through an IntersectionObserver, and `WordViewer` prefetches the images of neighbouring words.
- The UI text is a mix of Czech and English on purpose, and `index.html` sets `lang="cs"`.
