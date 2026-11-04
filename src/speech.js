// Czech is played from pre-generated recordings (public/audio/cs, made by
// scripts/gen_audio.py), so it sounds Czech even on computers without a Czech
// voice installed. Other languages, and Czech when a recording is missing,
// use the browser's speech synthesis with an explicitly chosen voice.

let current = null

function stop() {
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

function synthesize(text, lang) {
  if (!('speechSynthesis' in window)) return
  const voice = findVoice(lang)
  // A Czech word read by an English voice is worse than silence.
  if (!voice && lang.startsWith('cs')) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  if (voice) u.voice = voice
  window.speechSynthesis.speak(u)
}

// Voices load asynchronously in some browsers; touching the list starts loading.
if ('speechSynthesis' in window) window.speechSynthesis.getVoices()

export function speak(text, lang) {
  stop()
  if (!lang.startsWith('cs')) return synthesize(text, lang)
  const audio = new Audio(`audio/cs/${encodeURIComponent(text)}.mp3`)
  current = audio
  let fellBack = false
  const fallback = () => {
    if (fellBack || current !== audio) return
    fellBack = true
    synthesize(text, lang)
  }
  audio.onerror = fallback
  audio.play().catch((e) => e.name !== 'NotAllowedError' && fallback())
}
