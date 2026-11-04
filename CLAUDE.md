# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Česká slova": a single-page React 18 + Vite 6 app for browsing common Czech nouns letter by letter, with English translations, pictures from Wikipedia and Czech pronunciation. It has no backend, router or state library, and no tests or linter are set up.

## Commands

- `npm run dev`: start the Vite dev server
- `npm run build`: production build into `dist/`
- `npm run preview`: serve the built `dist/`

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the app and deploys it to GitHub Pages (https://jakubm.github.io/abeceda/). The Pages source in the repo settings must be "GitHub Actions". `dist/` is git-ignored; the deploy builds fresh. `vite.config.js` sets `base: './'` so the build works under the `/abeceda/` subpath or straight from the file system. Keep it that way.

## Architecture

- **`src/words.json`** is the whole dataset: an array of `{r, cz, en, k?, x?, img?}`.
  - `r` is the frequency rank (from UD Czech treebanks); the array is in rank order, and "most common first" sorting depends on that order.
  - `en` holds comma-separated English senses.
  - `k`, when present, marks a concrete, picturable word for the "kids" mode. Its value is a single child-friendly English word, which replaces `en` in that mode and drives the picture lookup.
  - `x: 1` excludes a word from the "all" mode, which otherwise holds the 2000 most common nouns.
  - Hand-added words at the end of the file have no `r`. They fill letters the frequency list doesn't cover (E and I for kids; Q, W, X and Y for both modes), so every letter has at least 2 words. The UI hides the rank line when `r` is missing.
- **`src/App.jsx`** holds all the UI and logic:
  - The Czech alphabet treats `CH`, `Č`, `Ř`, `Š` and `Ž` as separate letters. Other accented letters are folded into their base letter through `FOLD` / `letterOf`.
  - `MODES` and `BY_LETTER` are precomputed once when the module loads.
  - The selected mode is saved in `localStorage` (`czech-nouns-mode`).
- **Pictures** are served locally from `public/img/<cz>.webp`; there are no Wikipedia calls at runtime.
  - `src/pictures.json` lists the words that have a picture. `src/images.js` turns it into URLs, and `WordViewer` preloads the neighbouring words' pictures. Words without one show their first letter.
  - `node scripts/fetch_images.mjs` (needs the `sharp` dev dependency) looks pictures up and saves them as 480 px WebP, then rewrites `pictures.json`. It only fetches words that have no file yet, so delete a word's `.webp` to re-fetch it.
  - Lookup order: the word's `img` override (`"en:Title"` or `"cs:Title"`), then English Wikipedia trying `k` and each English sense, then Czech Wikipedia by `cz`, then the Wikidata image (P18) of that Czech article. Disambiguation pages are skipped.
  - Every kids word has a picture; the kids words with weak automatic matches have hand-picked `img` overrides. About 560 abstract "all" words (possibility, reason, …) have none on purpose.
- **Speech (`src/speech.js`)**, `speak(text, lang)`:
  - Czech is played from pre-recorded MP3s at `public/audio/cs/<text>.mp3`, so it works on machines with no Czech voice installed.
  - If a recording is missing, it falls back to speech synthesis with an explicitly chosen Czech voice. With no Czech voice, it stays silent rather than reading Czech with an English voice.
  - English always uses speech synthesis.
  - Letter names live in `src/letters.json`.
  - After adding words or changing letter names, run `pip install edge-tts` and then `python scripts/gen_audio.py`. It uses the `cs-CZ-VlastaNeural` voice and only generates files that are missing. To re-record a text, delete its file first.
- The UI text is a mix of Czech and English on purpose, and `index.html` sets `lang="cs"`.
