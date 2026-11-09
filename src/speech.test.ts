import { beforeEach, describe, expect, it, vi } from 'vitest'

class Recording {
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  pause = vi.fn()
  play = vi.fn(async () => {
    if (playError) throw playError
  })

  constructor(readonly src: string) {
    recordings.push(this)
  }
}

class Utterance {
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly text: string) {}
}

function voice(lang: string): SpeechSynthesisVoice {
  return { lang, name: lang, voiceURI: lang, localService: true, default: false }
}

const recordings: Recording[] = []
const utterances: Utterance[] = []
let voices: SpeechSynthesisVoice[]
let playError: Error | null
const synthesis = {
  cancel: vi.fn(),
  getVoices: vi.fn(() => voices),
  speak: vi.fn((utterance: Utterance) => { utterances.push(utterance) }),
}

beforeEach(() => {
  vi.resetModules()
  recordings.length = 0
  utterances.length = 0
  voices = [voice('cs-CZ'), voice('en-US')]
  playError = null
  vi.stubGlobal('Audio', Recording)
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  vi.stubGlobal('speechSynthesis', synthesis)
})

describe('speech playback', () => {
  it('starts loading the browser voice list on import', async () => {
    await import('./speech')

    expect(synthesis.getVoices).toHaveBeenCalledOnce()
  })

  it('plays Czech recordings in sequence using encoded relative URLs', async () => {
    const { speak } = await import('./speech')
    const completion = speak(['čé', 'člověk'], 'cs-CZ')

    expect(recordings.map(recording => recording.src)).toEqual(['audio/cs/%C4%8D%C3%A9.mp3'])
    recordings[0].onended?.()
    await Promise.resolve()
    expect(recordings.map(recording => recording.src)).toEqual([
      'audio/cs/%C4%8D%C3%A9.mp3',
      'audio/cs/%C4%8Dlov%C4%9Bk.mp3',
    ])
    recordings[1].onended?.()
    await completion
    expect(synthesis.speak).not.toHaveBeenCalled()
  })

  it('interrupts old recordings and drops the remaining sequence', async () => {
    const { speak } = await import('./speech')
    const old = speak(['first', 'stale'], 'cs-CZ')
    const replacement = speak('replacement', 'cs-CZ')

    expect(recordings[0].pause).toHaveBeenCalledOnce()
    expect(synthesis.cancel).toHaveBeenCalledTimes(2)
    recordings[0].onended?.()
    await old
    recordings[1].onended?.()
    await replacement
    expect(recordings.map(recording => recording.src)).toEqual([
      'audio/cs/first.mp3',
      'audio/cs/replacement.mp3',
    ])
  })

  it('ignores a stale recording error after a new call', async () => {
    const { speak } = await import('./speech')
    const old = speak(['old', 'stale'], 'cs-CZ')
    const replacement = speak('new', 'cs-CZ')

    recordings[0].onerror?.()
    await old
    expect(synthesis.speak).not.toHaveBeenCalled()
    recordings[1].onended?.()
    await replacement
  })

  it('falls back to the exact Czech voice when a recording fails', async () => {
    voices = [voice('cs-SK'), voice('CS-cz')]
    const { speak } = await import('./speech')
    const completion = speak('čaj', 'cs-CZ')
    recordings[0].onerror?.()

    expect(utterances[0]).toMatchObject({ text: 'čaj', lang: 'cs-CZ', voice: voices[1] })
    utterances[0].onend?.()
    await completion
  })

  it('uses a matching base-language voice with an underscore locale', async () => {
    voices = [voice('cs_CZ')]
    const { speak } = await import('./speech')
    const completion = speak('čaj', 'cs-CZ')
    recordings[0].onerror?.()

    expect(utterances[0].voice).toBe(voices[0])
    utterances[0].onend?.()
    await completion
  })

  it('falls back only once when both the media error and play rejection fire', async () => {
    playError = new Error('Missing recording')
    const { speak } = await import('./speech')
    const completion = speak('missing', 'cs-CZ')
    recordings[0].onerror?.()
    await Promise.resolve()

    expect(synthesis.speak).toHaveBeenCalledOnce()
    utterances[0].onend?.()
    await completion
  })

  it('falls back when the play promise rejects without a media error', async () => {
    playError = new Error('Decode failed')
    const { speak } = await import('./speech')
    const completion = speak('missing', 'cs-CZ')
    await Promise.resolve()

    expect(synthesis.speak).toHaveBeenCalledOnce()
    utterances[0].onend?.()
    await completion
  })

  it('does not read Czech using an English voice', async () => {
    voices = [voice('en-US')]
    const { speak } = await import('./speech')
    const completion = speak('čaj', 'cs-CZ')
    recordings[0].onerror?.()
    await completion

    expect(synthesis.speak).not.toHaveBeenCalled()
  })

  it('does not bypass autoplay restrictions with synthesis', async () => {
    playError = new DOMException('Autoplay blocked', 'NotAllowedError')
    const { speak } = await import('./speech')

    await speak('čaj', 'cs-CZ')

    expect(synthesis.speak).not.toHaveBeenCalled()
  })

  it('uses synthesis directly for English and prefers a base-language voice', async () => {
    voices = [voice('en-GB')]
    const { speak } = await import('./speech')
    const completion = speak('tea', 'en-US')

    expect(recordings).toHaveLength(0)
    expect(utterances[0]).toMatchObject({ text: 'tea', lang: 'en-US', voice: voices[0] })
    utterances[0].onend?.()
    await completion
  })

  it('allows the browser default voice for English and resolves synthesis errors', async () => {
    voices = []
    const { speak } = await import('./speech')
    const completion = speak('tea', 'en-US')

    expect(utterances[0].voice).toBeNull()
    utterances[0].onerror?.()
    await completion
  })

  it('still plays Czech recordings without the speech synthesis API', async () => {
    Reflect.deleteProperty(window, 'speechSynthesis')
    const { speak } = await import('./speech')
    const completion = speak('čaj', 'cs-CZ')
    recordings[0].onended?.()
    await completion
    await speak('tea', 'en-US')

    expect(synthesis.getVoices).not.toHaveBeenCalled()
    expect(synthesis.speak).not.toHaveBeenCalled()
  })

  it('resolves a missing recording even without the speech synthesis API', async () => {
    Reflect.deleteProperty(window, 'speechSynthesis')
    const { speak } = await import('./speech')
    const completion = speak('missing', 'cs-CZ')
    recordings[0].onerror?.()
    await completion

    expect(synthesis.speak).not.toHaveBeenCalled()
  })

  it('accepts an empty sequence as a stop request', async () => {
    const { speak } = await import('./speech')

    await speak([], 'cs-CZ')

    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(recordings).toHaveLength(0)
    expect(utterances).toHaveLength(0)
  })
})
