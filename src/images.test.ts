import { beforeEach, describe, expect, it, vi } from 'vitest'

const images: { src: string }[] = []

beforeEach(() => {
  vi.resetModules()
  images.length = 0
  vi.stubGlobal('Image', class {
    src = ''
    constructor() {
      images.push(this)
    }
  })
})

describe('local pictures', () => {
  it('uses relative URLs and encodes Czech characters', async () => {
    const { imageUrl } = await import('./images')

    expect(imageUrl({ cz: 'auto' })).toBe('img/auto.webp')
    expect(imageUrl({ cz: 'čaj' })).toBe('img/%C4%8Daj.webp')
    expect(images).toHaveLength(0)
  })

  it('returns no URL for words outside the picture manifest', async () => {
    const { imageUrl } = await import('./images')

    expect(imageUrl({ cz: '__missing__' })).toBeNull()
  })

  it('preloads each picture only once', async () => {
    const { preloadImage } = await import('./images')

    preloadImage({ cz: 'auto' })
    preloadImage({ cz: 'auto' })
    preloadImage({ cz: 'čaj' })

    expect(images.map(image => image.src)).toEqual(['img/auto.webp', 'img/%C4%8Daj.webp'])
  })

  it('does not preload words without a picture', async () => {
    const { preloadImage } = await import('./images')

    preloadImage({ cz: '__missing__' })

    expect(images).toHaveLength(0)
  })
})
