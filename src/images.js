// Pictures are downloaded ahead of time by scripts/fetch_images.mjs into
// public/img/<word>.webp; src/pictures.json lists the words that have one.

import PICTURES from './pictures.json'

const HAS = new Set(PICTURES)
const warmed = new Set()

export function imageUrl(word) {
  return HAS.has(word.cz) ? `img/${encodeURIComponent(word.cz)}.webp` : null
}

// Start loading a picture in the background so it shows instantly later.
export function preloadImage(word) {
  const url = imageUrl(word)
  if (!url || warmed.has(url)) return
  warmed.add(url)
  new Image().src = url
}
