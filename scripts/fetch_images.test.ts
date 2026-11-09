// @vitest-environment node

import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { words, files, pipeline, sharp } = vi.hoisted(() => {
  const words = [
    { cz: 'existing', en: 'existing' },
    { cz: 'override', en: 'unused', img: 'en:Override' },
    { cz: 'cs-override', en: 'unused', img: 'cs:Override' },
    { cz: 'kids', en: 'Adult', k: 'Child' },
    { cz: 'sense', en: 'Missing (abstract), Second' },
    { cz: 'czech', en: 'Missing' },
    { cz: 'wikidata', en: 'Missing' },
    { cz: 'ambiguous', en: 'Ambiguous' },
    { cz: 'failed', en: 'Failed' },
    { cz: 'missing', en: 'Missing' },
    { cz: 'redirect', en: 'redirect' },
  ]
  const pipeline = {
    flatten: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toFile: vi.fn<(filename: string) => Promise<void>>().mockResolvedValue(undefined),
  }
  const sharp = Object.assign(vi.fn(() => pipeline), { cache: vi.fn() })
  return {
    words,
    pipeline,
    sharp,
    files: {
      mkdirSync: vi.fn(),
      readdirSync: vi.fn<() => string[]>(),
      writeFileSync: vi.fn<(filename: string, content: string) => void>(),
    },
  }
})

vi.mock('node:fs', () => ({ default: files }))
vi.mock('sharp', () => ({ default: sharp }))
vi.mock('../src/words.json', () => ({ default: words }))

let apiStatuses: number[]
let emptyResponses: boolean
let missingClaims: boolean
const realSetTimeout = globalThis.setTimeout

const fetchMock = vi.fn<typeof fetch>(async input => {
  const url = new URL(String(input))
  if (url.pathname !== '/w/api.php') {
    return url.pathname.includes('Failed')
      ? new Response('Not found', { status: 404 })
      : new Response(new Uint8Array([1, 2, 3]))
  }

  const status = apiStatuses.shift()
  if (status) return new Response('Unavailable', { status })
  if (emptyResponses) return Response.json({})
  if (url.searchParams.get('action') === 'wbgetentities') {
    const entities = Object.fromEntries(url.searchParams.get('ids')!.split('|').map(id => [
      id,
      missingClaims ? {} : { claims: { P18: [{ mainsnak: { datavalue: { value: `${id} image.jpg` } } }] } },
    ]))
    return Response.json({ entities })
  }

  const lang = url.hostname.split('.')[0]
  const titles = url.searchParams.get('titles')!.split('|')
  const pages = titles.map(title => {
    if (lang === 'en' && title === 'redirect') {
      return { title: 'Canonical', thumbnail: { source: 'https://images.example/redirect.webp' } }
    }
    if ((lang === 'en' && ['Override', 'Child', 'Second', 'Failed'].includes(title)) ||
        (lang === 'cs' && title === 'czech')) {
      return { title, thumbnail: { source: `https://images.example/${title}.webp` } }
    }
    if (lang === 'cs' && ['Override', 'wikidata'].includes(title)) {
      return { title, pageprops: { wikibase_item: `Q${title}` } }
    }
    if (title === 'Ambiguous') {
      return { title, pageprops: { disambiguation: '' }, thumbnail: { source: 'https://images.example/wrong.webp' } }
    }
    return { title, missing: true }
  })
  return Response.json({
    query: {
      pages,
      ...(titles.includes('redirect') ? {
        normalized: [{ from: 'redirect', to: 'Redirect' }],
        redirects: [{ from: 'Redirect', to: 'Canonical' }],
      } : {}),
    },
  })
})

beforeEach(() => {
  vi.resetModules()
  files.readdirSync.mockReturnValue(['existing.webp', 'unrelated.txt'])
  pipeline.toFile.mockResolvedValue(undefined)
  apiStatuses = []
  emptyResponses = false
  missingClaims = false
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, _delay, ...args) =>
    realSetTimeout(callback, 0, ...args))
})

function manifest() {
  const [filename, content] = files.writeFileSync.mock.calls[0]
  expect(filename).toBe(path.resolve('src/pictures.json'))
  expect(content).toMatch(/\n$/)
  return JSON.parse(content)
}

describe('picture maintenance', () => {
  it('keeps existing files and uses overrides, senses, Czech, Wikidata and redirected pages', async () => {
    await import('./fetch_images')

    expect(manifest()).toEqual([
      'existing', 'override', 'cs-override', 'kids', 'sense', 'czech', 'wikidata', 'redirect',
    ])
    expect(pipeline.toFile.mock.calls.map(([filename]) => path.basename(filename)).sort()).toEqual([
      'cs-override.webp', 'czech.webp', 'kids.webp', 'override.webp', 'redirect.webp', 'sense.webp', 'wikidata.webp',
    ])
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)))
    expect(requests.some(url => url.pathname.includes('existing'))).toBe(false)
    expect(requests.some(url => url.pathname.includes('wrong.webp'))).toBe(false)
    expect(requests.some(url => url.href.includes('Qwikidata%20image.jpg'))).toBe(true)
    const english = requests.find(url => url.hostname === 'en.wikipedia.org')!
    expect(english.searchParams.get('titles')).toContain('Missing|Second')
    expect(english.searchParams.get('titles')).toContain('Child')
    expect(english.searchParams.get('titles')).not.toContain('unused')
    expect(sharp.cache).toHaveBeenCalledWith(false)
    expect(sharp).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), { animated: false })
    expect(pipeline.flatten).toHaveBeenCalledWith({ background: '#ffffff' })
    expect(pipeline.resize).toHaveBeenCalledWith({ width: 480, withoutEnlargement: true })
    expect(pipeline.webp).toHaveBeenCalledWith({ quality: 72 })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('failed 404'))
    expect(console.log).toHaveBeenCalledWith('  ambiguous')
  })

  it('does not make network requests when every picture already exists', async () => {
    files.readdirSync.mockReturnValue(words.map(word => `${word.cz}.webp`))

    await import('./fetch_images')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(sharp).not.toHaveBeenCalled()
    expect(manifest()).toEqual(words.map(word => word.cz))
  })

  it('retries rate limits and server errors with exponential backoff', async () => {
    apiStatuses = [429, 503]

    await import('./fetch_images')

    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000)
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 4000)
    expect(manifest()).toContain('override')
  })

  it('reports non-retryable API errors without overwriting the manifest', async () => {
    apiStatuses = [404]

    await expect(import('./fetch_images')).rejects.toThrow('404 https://en.wikipedia.org/')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(files.writeFileSync).not.toHaveBeenCalled()
  })

  it('stops after six unsuccessful API attempts', async () => {
    apiStatuses = Array(6).fill(503)

    await expect(import('./fetch_images')).rejects.toThrow('gave up https://en.wikipedia.org/')

    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 64000)
    expect(files.writeFileSync).not.toHaveBeenCalled()
  })

  it('handles API responses without a query result', async () => {
    emptyResponses = true

    await import('./fetch_images')

    expect(manifest()).toEqual(['existing'])
    expect(sharp).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('  kids (kids)')
  })

  it('leaves words without a Wikidata image out of the manifest', async () => {
    missingClaims = true

    await import('./fetch_images')

    expect(manifest()).not.toContain('wikidata')
    expect(manifest()).not.toContain('cs-override')
    expect(manifest()).toContain('czech')
  })

  it('reports non-Error image-processing failures and excludes failed files', async () => {
    pipeline.toFile.mockRejectedValue('Conversion failed')

    await import('./fetch_images')

    expect(manifest()).toEqual(['existing'])
    expect(console.log).toHaveBeenCalledWith('  kids (kids) Conversion failed')
  })
})
