import { useEffect, useMemo, useState } from 'react'
import WORDS from './words.json'
import LETTER_NAMES from './letters.json' // how each letter is named aloud in Czech
import { imageUrl, preloadImage } from './images.js'
import { speak } from './speech.js'

// Czech alphabet. Č, CH, Ř, Š, Ž are separate letters; other accented
// letters (Á, Ď, É, Í, Ň, Ó, Ť, Ú, Ů, Ý) are grouped under their base letter.
const ALPHABET = [
  'A', 'B', 'C', 'Č', 'D', 'E', 'F', 'G', 'H', 'CH', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'Ř', 'S', 'Š', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ž',
]
const FOLD = { á: 'a', ď: 'd', é: 'e', ě: 'e', í: 'i', ň: 'n', ó: 'o', ť: 't', ú: 'u', ů: 'u', ý: 'y' }

function letterOf(word) {
  const w = word.toLowerCase()
  if (w.startsWith('ch')) return 'CH'
  const c = w[0]
  return (FOLD[c] || c).toUpperCase()
}

// "kids": concrete, picturable words a 6-year-old knows, with a single
// child-friendly translation (also used to find the right picture).
// "all": the 2000 most common nouns.
const MODES = {
  kids: WORDS.filter((w) => w.k).map((w) => ({ ...w, en: w.k })),
  all: WORDS.filter((w) => !w.x),
}

function groupByLetter(list) {
  const m = Object.fromEntries(ALPHABET.map((l) => [l, []]))
  for (const w of list) m[letterOf(w.cz)]?.push(w)
  return m
}
const BY_LETTER = { kids: groupByLetter(MODES.kids), all: groupByLetter(MODES.all) }

function loadMode() {
  try {
    return localStorage.getItem('czech-nouns-mode') === 'all' ? 'all' : 'kids'
  } catch {
    return 'kids'
  }
}

function Picture({ word }) {
  const [broken, setBroken] = useState(false)
  const src = imageUrl(word)

  return (
    <div className="pic">
      {src && !broken ? (
        <img src={src} alt={word.en} onError={() => setBroken(true)} />
      ) : (
        <span className="pic-fallback">{word.cz[0].toUpperCase()}</span>
      )}
    </div>
  )
}

function WordViewer({ words, index, setIndex }) {
  const word = words[index]
  const prev = () => go(index - 1)
  const next = () => go(index + 1)
  function go(i) {
    const n = (i + words.length) % words.length
    speak(words[n].cz, 'cs-CZ')
    setIndex(n)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'SELECT') return
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Warm up the image cache for the neighbouring words.
  useEffect(() => {
    if (words.length < 2) return
    preloadImage(words[(index + 1) % words.length])
    preloadImage(words[(index - 1 + words.length) % words.length])
  }, [words, index])

  return (
    <main className="viewer">
      <div className="detail">
        <Picture key={word.cz} word={word} />
        <h2>
          {word.cz}
          <button className="say" onClick={() => speak(word.cz, 'cs-CZ')} title="Vyslovit česky">🔊</button>
        </h2>
        <p className="detail-en">
          {word.en}
          <button className="say" onClick={() => speak(word.en.split(',')[0], 'en-US')} title="Say in English">🔊</button>
        </p>
        {word.r && <p className="meta">Frequency rank #{word.r}</p>}
      </div>
      <div className="nav">
        <button onClick={prev} disabled={words.length < 2}>← Previous</button>
        <span className="pos">{index + 1} / {words.length}</span>
        <button onClick={next} disabled={words.length < 2}>Next →</button>
      </div>
    </main>
  )
}

export default function App() {
  const [mode, setMode] = useState(loadMode)
  const [letter, setLetter] = useState(null)
  const [sort, setSort] = useState('freq')
  const [index, setIndex] = useState(0)
  const byLetter = BY_LETTER[mode]

  const sorted = (l, s, m = mode) => {
    const list = [...BY_LETTER[m][l]]
    if (s === 'alpha') list.sort((a, b) => a.cz.localeCompare(b.cz, 'cs'))
    return list
  }

  const words = useMemo(() => (letter ? sorted(letter, sort) : []), [letter, sort, mode])

  const choose = (l) => {
    const first = sorted(l, sort)[0]
    speak([LETTER_NAMES[l], first?.cz].filter(Boolean), 'cs-CZ')
    setLetter(l)
    setIndex(0)
  }

  const changeSort = (s) => {
    setSort(s)
    setIndex(0)
  }

  const changeMode = (m) => {
    setMode(m)
    setIndex(0)
    if (letter && BY_LETTER[m][letter].length === 0) setLetter(null)
    try {
      localStorage.setItem('czech-nouns-mode', m)
    } catch {
      /* ignore */
    }
  }

  const randomWord = () => {
    const pool = MODES[mode]
    const w = pool[Math.floor(Math.random() * pool.length)]
    const l = letterOf(w.cz)
    speak(w.cz, 'cs-CZ')
    setLetter(l)
    setIndex(sorted(l, sort).indexOf(w))
  }

  return (
    <div className="app">
      <header>
        <h1>Česká slova <span>· Czech words</span></h1>
        <p className="sub">
          {mode === 'kids'
            ? `${MODES.kids.length} everyday words for 6-year-olds. Pick a letter.`
            : 'The 2000 most common Czech nouns. Pick a letter.'}
        </p>
        <div className="modes" role="group" aria-label="Word list">
          <button className={mode === 'kids' ? 'active' : ''} onClick={() => changeMode('kids')}>
            🧒 Pro děti (6 let)
          </button>
          <button className={mode === 'all' ? 'active' : ''} onClick={() => changeMode('all')}>
            📚 All 2000
          </button>
        </div>
      </header>

      <nav className="letters">
        {ALPHABET.map((l) => {
          const n = byLetter[l].length
          return (
            <button
              key={l}
              className={`letter${l === letter ? ' active' : ''}`}
              disabled={n === 0}
              onClick={() => choose(l)}
              title={`${n} words`}
            >
              {l}
              <small>{n}</small>
            </button>
          )
        })}
      </nav>

      <div className="toolbar">
        {letter && (
          <label>
            Order:{' '}
            <select value={sort} onChange={(e) => changeSort(e.target.value)}>
              <option value="freq">most common first</option>
              <option value="alpha">alphabetical</option>
            </select>
          </label>
        )}
        <button className="random" onClick={randomWord}>🎲 Random word</button>
      </div>

      {letter && words[index] ? (
        <WordViewer words={words} index={index} setIndex={setIndex} />
      ) : (
        <p className="empty">Choose a letter above to start.</p>
      )}

      <footer>
        Word frequencies from Universal Dependencies Czech treebanks (PDT-C, CAC, FicTree).
        Pictures from Wikipedia.
      </footer>
    </div>
  )
}
