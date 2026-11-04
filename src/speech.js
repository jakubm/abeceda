// Czech is played from pre-generated recordings (public/audio/cs, made by
// scripts/gen_audio.py), so it sounds Czech even on computers without a Czech
// voice installed. Other languages, and Czech when a recording is missing,
// use the browser's speech synthesis with an explicitly chosen voice.

let current = null // the Audio element playing right now
let generation = 0 // bumped on every speak() so stale sequences stop

function stop() {
  generation++
  if (current) {
    current.pause()
    current = null
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

function findVoice(lang) {
  const voices = window.speechSynthesis.getVoices()
  const base = lang.split('-')[0].toLowerCase()
  return (
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base)) ||
    null
  )
}

// Resolves when the utterance ends (or immediately if it can't be spoken).
function synthesize(text, lang) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    const voice = findVoice(lang)
    // A Czech word read by an English voice is worse than silence.
    if (!voice && lang.startsWith('cs')) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    if (voice) u.voice = voice
    u.onend = u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

// Resolves when the recording ends; falls back to synthesis if it can't load.
function playRecording(text, lang) {
  return new Promise((resolve) => {
    const audio = new Audio(`audio/cs/${encodeURIComponent(text)}.mp3`)
    current = audio
    let fellBack = false
    const fallback = () => {
      if (fellBack || current !== audio) return resolve()
      fellBack = true
      synthesize(text, lang).then(resolve)
    }
    audio.onended = () => resolve()
    audio.onerror = fallback
    audio.play().catch((e) => (e.name === 'NotAllowedError' ? resolve() : fallback()))
  })
}

// Voices load asynchronously in some browsers; touching the list starts loading.
if ('speechSynthesis' in window) window.speechSynthesis.getVoices()

// Speak one text, or several one after another. A new call interrupts the old one.
export async function speak(texts, lang) {
  stop()
  const gen = generation
  for (const text of [].concat(texts)) {
    if (gen !== generation) return
    await (lang.startsWith('cs') ? playRecording(text, lang) : synthesize(text, lang))
  }
}
