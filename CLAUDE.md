# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Česká slova": a single-page TypeScript + React 18 + Vite 6 app for browsing common Czech nouns letter by letter, with English translations, pictures from Wikipedia and Czech pronunciation. It has no backend, router or state library. Vitest and React Testing Library cover the app and maintenance script; no linter is set up.

## Commands

- `npm run dev`: start the Vite dev server
- `npm run build`: type-check the project, then build for production into `dist/`
- `npm run preview`: serve the built `dist/`
- `npm run typecheck`: check the app, Vite configuration and TypeScript maintenance scripts without emitting files
- `npm run fetch-images`: download missing word pictures with `tsx`
- `npm test`: run the test suite once
- `npm run test:watch`: rerun affected tests while editing
- `npm run test:coverage`: run tests with terminal, HTML and LCOV coverage reports in `coverage/`

`tsconfig.json` enables strict type-checking. `src/types.ts` defines the shared word shape, including the optional rank for hand-added words.

Use a current Node 22, 24 or 26 release for the test tooling. Vitest uses jsdom for browser tests and Node for the image-fetching script tests. Tests live beside their modules as `*.test.ts` or `*.test.tsx`. Media, speech APIs, filesystem writes and network requests are mocked. Coverage includes application entry-point code and the image-fetching script, with minimums of 90% for statements, functions and lines and 85% for branches. Type-only declarations are excluded.

Pull requests run coverage checks and the production build in `.github/workflows/test.yml`. The deployment workflow also checks coverage before publishing.

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the app and deploys it to GitHub Pages (https://jakubm.github.io/abeceda/). The Pages source in the repo settings must be "GitHub Actions". `dist/` is git-ignored; the deploy builds fresh. `vite.config.ts` sets `base: './'` so the build works under the `/abeceda/` subpath or straight from the file system. Keep it that way.

## Architecture

- **`src/words.json`** is the whole dataset: an array of `{r?, cz, en, k?, x?, img?}`.
  - `r` is the frequency rank (from UD Czech treebanks); the array is in rank order, and "most common first" sorting depends on that order.
  - `en` holds comma-separated English senses.
  - `k`, when present, marks a concrete, picturable word for the "kids" mode. Its value is a single child-friendly English word, which replaces `en` in that mode and drives the picture lookup.
  - `x: 1` excludes a word from the "all" mode, which otherwise holds the 2000 most common nouns.
  - Hand-added words at the end of the file have no `r`. They fill letters the frequency list doesn't cover (E and I for kids; Q, W, X and Y for both modes), so every letter has at least 2 words. The UI hides the rank line when `r` is missing.
- **`src/App.tsx`** holds all the UI and logic:
  - The Czech alphabet treats `CH`, `Č`, `Ř`, `Š` and `Ž` as separate letters. Other accented letters are folded into their base letter through `FOLD` / `letterOf`.
  - `MODES` and `BY_LETTER` are precomputed once when the module loads.
  - The selected mode is saved in `localStorage` (`czech-nouns-mode`).
- **Pictures** are served locally from `public/img/<cz>.webp`; there are no Wikipedia calls at runtime.
  - `src/pictures.json` lists the words that have a picture. `src/images.ts` turns it into URLs, and `WordViewer` preloads the neighbouring words' pictures. Words without one show their first letter.
  - `npm run fetch-images` runs `scripts/fetch_images.ts` with the `sharp` dev dependency. It looks pictures up and saves them as 480 px WebP, then rewrites `pictures.json`. It only fetches words that have no file yet, so delete a word's `.webp` to re-fetch it.
  - Lookup order: the word's `img` override (`"en:Title"` or `"cs:Title"`), then English Wikipedia trying `k` and each English sense, then Czech Wikipedia by `cz`, then the Wikidata image (P18) of that Czech article. Disambiguation pages are skipped.
  - Every kids word has a picture; the kids words with weak automatic matches have hand-picked `img` overrides. About 560 abstract "all" words (possibility, reason, …) have none on purpose.
- **Speech (`src/speech.ts`)**, `speak(text, lang)`:
  - Czech is played from pre-recorded MP3s at `public/audio/cs/<text>.mp3`, so it works on machines with no Czech voice installed.
  - If a recording is missing, it falls back to speech synthesis with an explicitly chosen Czech voice. With no Czech voice, it stays silent rather than reading Czech with an English voice.
  - English always uses speech synthesis.
  - Letter names live in `src/letters.json`.
  - After adding words or changing letter names, run `pip install edge-tts` and then `python scripts/gen_audio.py`. It uses the `cs-CZ-VlastaNeural` voice and only generates files that are missing. To re-record a text, delete its file first.
- The UI text is a mix of Czech and English on purpose, and `index.html` sets `lang="cs"`.
