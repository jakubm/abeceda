// Looks up a picture for a word using Wikipedia page thumbnails (CORS-enabled REST API).
// Order: English Wikipedia (first English sense) -> Czech Wikipedia (Czech lemma).
// Results (including misses) are cached in memory and localStorage.

const CACHE_KEY = 'czech-nouns-img-v2'
const memory = new Map()
const inflight = new Map()

let stored = {}
try {
  stored = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
} catch {
  stored = {}
}

function persist() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(stored))
  } catch {
    /* storage unavailable or full - ignore */
  }
}

function firstSense(en) {
  return en
    .split(',')[0]
    .replace(/\(.*?\)/g, '')
    .trim()
}

async function summaryThumb(lang, title) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  const data = await res.json()
  if (data.type === 'disambiguation') return null
  return data.thumbnail?.source || data.originalimage?.source || null
}

export function getImage(word) {
  const key = `${word.cz}|${firstSense(word.en)}`
  if (memory.has(key)) return Promise.resolve(memory.get(key))
  if (key in stored) {
    memory.set(key, stored[key])
    return Promise.resolve(stored[key])
  }
  if (inflight.has(key)) return inflight.get(key)

  const p = (async () => {
    let src = null
    try {
      src = await summaryThumb('en', firstSense(word.en))
      if (!src) src = await summaryThumb('cs', word.cz)
    } catch {
      return null // network error: don't cache, retry next time
    }
    memory.set(key, src)
    stored[key] = src
    persist()
    return src
  })().finally(() => inflight.delete(key))

  inflight.set(key, p)
  return p
}
