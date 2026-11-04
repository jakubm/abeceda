// Download a picture for every word so the app serves them locally.
//
// For each word in src/words.json it looks for a Wikipedia page image:
//   1. the `img` override if present ("en:Title" or "cs:Title"),
//   2. English Wikipedia, titled by the kids translation `k` or the first English sense,
//   3. Czech Wikipedia, titled by the Czech word,
//   4. the Wikidata image (P18) of that Czech article.
// Pages that are disambiguations are skipped. Pictures are resized to WIDTH px and
// saved as public/img/<cz>.webp; src/pictures.json lists which words have one.
// Existing files are kept, so re-run it after adding words or overrides
// (delete a word's file to force a new lookup).
//
//     node scripts/fetch_images.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
sharp.cache(false) // on Windows the cache keeps files locked

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'img')
const MANIFEST = path.join(ROOT, 'src', 'pictures.json')
const THUMB = 500 // Wikimedia standard thumbnail width to download
const WIDTH = 480 // stored width
const HEADERS = { 'User-Agent': 'abeceda-image-fetch/1.0 (https://github.com/jakubm/abeceda)' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const firstSense = (en) => en.split(',')[0].replace(/\(.*?\)/g, '').trim()

async function get(url, as = 'json') {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: HEADERS })
    if (res.ok) return as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer())
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`)
    await sleep(2000 * 2 ** attempt)
  }
  throw new Error(`gave up ${url}`)
}

async function query(host, params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params })
  const data = await get(`https://${host}/w/api.php?${qs}`)
  await sleep(200)
  return data
}

// Look up many titles on one wiki. Returns title -> { thumb, item } for pages that
// exist and are not disambiguations (`item` is the Wikidata id).
async function lookup(lang, titles) {
  const found = new Map()
  const unique = [...new Set(titles)]
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50)
    const q = (await query(`${lang}.wikipedia.org`, {
      action: 'query', redirects: '1', titles: batch.join('|'),
      prop: 'pageimages|pageprops', piprop: 'thumbnail', pithumbsize: String(THUMB),
      ppprop: 'disambiguation|wikibase_item',
    })).query || {}
    // Map normalized / redirected titles back to the ones we asked for.
    const asked = new Map()
    for (const r of [...(q.normalized || []), ...(q.redirects || [])]) {
      asked.set(r.to, [...(asked.get(r.to) || []), r.from, ...(asked.get(r.from) || [])])
    }
    for (const p of q.pages || []) {
      if (p.missing || p.pageprops?.disambiguation !== undefined) continue
      const hit = { thumb: p.thumbnail?.source || null, item: p.pageprops?.wikibase_item || null }
      for (const t of [p.title, ...(asked.get(p.title) || [])]) if (batch.includes(t)) found.set(t, hit)
    }
  }
  return found
}

// Wikidata item id -> thumbnail URL of its main image (P18).
async function wikidataImages(items) {
  const found = new Map()
  const unique = [...new Set(items)]
  for (let i = 0; i < unique.length; i += 50) {
    const data = await query('www.wikidata.org', {
      action: 'wbgetentities', ids: unique.slice(i, i + 50).join('|'), props: 'claims',
    })
    for (const [id, e] of Object.entries(data.entities || {})) {
      const file = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value
      if (file) {
        found.set(id, `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${THUMB}`)
      }
    }
  }
  return found
}

const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'words.json'), 'utf8'))
fs.mkdirSync(OUT, { recursive: true })
const have = new Set(fs.readdirSync(OUT).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)))

const plan = words
  .filter((w) => !have.has(w.cz))
  .map((w) => {
    if (w.img) {
      const [lang, title] = w.img.split(/:(.*)/s)
      return { w, lang, title, titles: [title], src: null }
    }
    // Every English sense, in order: "side, page, party" tries Side, then Page, then Party.
    const senses = [w.k, ...w.en.split(',')].filter(Boolean).map(firstSense).filter(Boolean)
    return { w, lang: 'en', title: senses[0], titles: [...new Set(senses)], src: null }
  })
console.log(`${words.length} words, ${have.size} already have pictures, ${plan.length} to look up`)

const enPlan = plan.filter((p) => p.lang === 'en')
const en = await lookup('en', enPlan.flatMap((p) => p.titles))
for (const p of enPlan) p.src = p.titles.map((t) => en.get(t)?.thumb).find(Boolean) || null

// Czech fallback (and Czech overrides), then that article's Wikidata image.
const csPlan = plan.filter((p) => !p.src && (p.lang === 'cs' || !p.w.img))
const csTitle = (p) => (p.lang === 'cs' ? p.title : p.w.cz)
const cs = await lookup('cs', csPlan.map(csTitle))
for (const p of csPlan) p.src = cs.get(csTitle(p))?.thumb || null
const wdPlan = csPlan.filter((p) => !p.src && cs.get(csTitle(p))?.item)
const wd = await wikidataImages(wdPlan.map((p) => cs.get(csTitle(p)).item))
for (const p of wdPlan) p.src = wd.get(cs.get(csTitle(p)).item) || null

const missing = plan.filter((p) => !p.src).map((p) => p.w)
const todo = plan.filter((p) => p.src)
let next = 0
async function worker() {
  while (next < todo.length) {
    const p = todo[next++]
    try {
      const buf = await get(p.src, 'buffer')
      await sharp(buf, { animated: false })
        .flatten({ background: '#ffffff' })
        .resize({ width: WIDTH, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toFile(path.join(OUT, `${p.w.cz}.webp`))
      have.add(p.w.cz)
    } catch (e) {
      missing.push({ ...p.w, error: e.message })
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker))

const manifest = words.filter((w) => have.has(w.cz)).map((w) => w.cz)
fs.writeFileSync(MANIFEST, JSON.stringify(manifest) + '\n')

console.log(`${manifest.length} words have pictures, ${missing.length} without:`)
for (const m of missing) console.log(`  ${m.cz}${m.k ? ' (kids)' : ''}${m.error ? ' ' + m.error : ''}`)
