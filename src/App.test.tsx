import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { imageUrl, preloadImage } from './images'
import LETTER_NAMES from './letters.json'
import { speak } from './speech'
import wordData from './words.json'
import type { Word } from './types'

vi.mock('./speech', () => ({ speak: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./images', () => ({ imageUrl: vi.fn(), preloadImage: vi.fn() }))

const words: Word[] = wordData
const kids = words.filter(word => word.k)
const all = words.filter(word => !word.x)
const letterButton = (letter: string) => screen.getByRole('button', { name: new RegExp(`^${letter}\\s*\\d+$`) })
const heading = () => screen.getByRole('heading', { level: 2 })
const nextButton = () => screen.getByRole('button', { name: 'Next →' })
const previousButton = () => screen.getByRole('button', { name: '← Previous' })

function initial(word: string) {
  if (/^ch/i.test(word)) return 'CH'
  const first = word[0].toUpperCase()
  return 'ČŘŠŽ'.includes(first) ? first : first.normalize('NFD').replace(/\p{M}/gu, '')
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(imageUrl).mockImplementation(word => `img/${encodeURIComponent(word.cz)}.webp`)
})

describe('word browsing', () => {
  it('starts in kids mode without a selected letter', () => {
    render(<App />)

    expect(screen.getByText('Choose a letter above to start.')).toBeInTheDocument()
    expect(screen.getByText(`${kids.length} everyday words for 6-year-olds. Pick a letter.`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pro děti/ })).toHaveClass('active')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it.each(['kids', 'all'] as const)('groups every letter correctly in %s mode', mode => {
    localStorage.setItem('czech-nouns-mode', mode)
    render(<App />)
    const pool = mode === 'kids' ? kids : all

    for (const letter of Object.keys(LETTER_NAMES)) {
      const expected = pool.filter(word => initial(word.cz) === letter)
      const button = letterButton(letter)

      expect(within(button).getByText(String(expected.length))).toBeInTheDocument()
      expect(expected.length).toBeGreaterThanOrEqual(2)
      fireEvent.click(button)
      expect(heading()).toHaveTextContent(expected[0].cz)
      expect(screen.getByText(`1 / ${expected.length}`)).toBeInTheDocument()
      expect(screen.getByAltText(mode === 'kids' ? expected[0].k! : expected[0].en)).toBeInTheDocument()
    }
  })

  it('uses child-friendly senses and speaks the letter before the word', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(letterButton('C'))

    expect(heading()).toHaveTextContent('cesta')
    expect(screen.getByAltText('road')).toHaveAttribute('src', 'img/cesta.webp')
    expect(screen.getByText('Frequency rank #20')).toBeInTheDocument()
    expect(speak).toHaveBeenCalledWith(['cé', 'cesta'], 'cs-CZ')

    await user.click(screen.getByRole('button', { name: /All 2000/ }))
    expect(screen.getByAltText('way, road, journey')).toBeInTheDocument()
    expect(localStorage.getItem('czech-nouns-mode')).toBe('all')
  })

  it('wraps button navigation and preloads neighbouring pictures', async () => {
    const user = userEvent.setup()
    const group = kids.filter(word => initial(word.cz) === 'C')
    render(<App />)
    await user.click(letterButton('C'))

    expect(preloadImage).toHaveBeenCalledWith(expect.objectContaining({ cz: group[1].cz }))
    expect(preloadImage).toHaveBeenCalledWith(expect.objectContaining({ cz: group.at(-1)!.cz }))

    await user.click(previousButton())
    expect(heading()).toHaveTextContent(group.at(-1)!.cz)
    expect(screen.getByText(`${group.length} / ${group.length}`)).toBeInTheDocument()
    expect(speak).toHaveBeenLastCalledWith(group.at(-1)!.cz, 'cs-CZ')

    await user.click(nextButton())
    expect(heading()).toHaveTextContent(group[0].cz)
    expect(screen.getByText(`1 / ${group.length}`)).toBeInTheDocument()
  })

  it('supports arrow keys without intercepting the sort selector', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(letterButton('C'))
    const first = heading().textContent

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(heading().textContent).not.toBe(first)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(heading().textContent).toBe(first)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowRight' })
    expect(heading().textContent).toBe(first)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(heading().textContent).toBe(first)
  })

  it('removes its keyboard listener on unmount', () => {
    const { unmount } = render(<App />)
    fireEvent.click(letterButton('C'))
    unmount()
    vi.mocked(speak).mockClear()

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(speak).not.toHaveBeenCalled()
  })

  it('sorts with Czech collation and resets the position on sort and letter changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(letterButton('C'))
    await user.click(nextButton())
    await user.selectOptions(screen.getByRole('combobox'), 'alpha')

    const alphabetical = kids.filter(word => initial(word.cz) === 'C')
      .sort((a, b) => a.cz.localeCompare(b.cz, 'cs'))
    for (const word of alphabetical) {
      expect(heading()).toHaveTextContent(word.cz)
      await user.click(nextButton())
    }
    expect(screen.getByText(`1 / ${alphabetical.length}`)).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox'), 'freq')
    expect(heading()).toHaveTextContent('cesta')
    await user.click(nextButton())
    await user.click(letterButton('Q'))
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('resets the position when changing mode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(letterButton('C'))
    await user.click(nextButton())
    await user.click(screen.getByRole('button', { name: /All 2000/ }))

    expect(heading()).toHaveTextContent('cesta')
    expect(screen.getByText(`1 / ${all.filter(word => initial(word.cz) === 'C').length}`)).toBeInTheDocument()
  })

  it.each(['kids', 'all'] as const)('selects a random word from %s mode with the correct sorted position', async mode => {
    const user = userEvent.setup()
    localStorage.setItem('czech-nouns-mode', mode)
    render(<App />)
    await user.click(letterButton('C'))
    await user.selectOptions(screen.getByRole('combobox'), 'alpha')
    const pool = mode === 'kids' ? kids : all
    const selected = pool.at(-1)!
    vi.spyOn(Math, 'random').mockReturnValue(1 - Number.EPSILON)

    await user.click(screen.getByRole('button', { name: /Random word/ }))

    const group = pool.filter(word => initial(word.cz) === initial(selected.cz))
      .sort((a, b) => a.cz.localeCompare(b.cz, 'cs'))
    expect(heading()).toHaveTextContent(selected.cz)
    expect(letterButton(initial(selected.cz))).toHaveClass('active')
    expect(screen.getByText(`${group.indexOf(selected) + 1} / ${group.length}`)).toBeInTheDocument()
    expect(speak).toHaveBeenLastCalledWith(selected.cz, 'cs-CZ')
  })

  it('plays Czech and only the first English sense from the pronunciation buttons', async () => {
    const user = userEvent.setup()
    localStorage.setItem('czech-nouns-mode', 'all')
    render(<App />)
    await user.click(letterButton('C'))

    await user.click(screen.getByTitle('Vyslovit česky'))
    expect(speak).toHaveBeenLastCalledWith('cesta', 'cs-CZ')
    await user.click(screen.getByTitle('Say in English'))
    expect(speak).toHaveBeenLastCalledWith('way', 'en-US')
  })

  it('hides the rank for hand-added words', () => {
    render(<App />)
    fireEvent.click(letterButton('Q'))

    expect(heading()).toHaveTextContent('quinoa')
    expect(screen.queryByText(/Frequency rank/)).not.toBeInTheDocument()
  })

  it('shows a letter for missing pictures', () => {
    vi.mocked(imageUrl).mockReturnValue(null)
    render(<App />)
    fireEvent.click(letterButton('C'))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('C', { selector: '.pic-fallback' })).toBeInTheDocument()
  })

  it('falls back after an image fails and retries the next word picture', () => {
    render(<App />)
    fireEvent.click(letterButton('C'))
    fireEvent.error(screen.getByRole('img'))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('C', { selector: '.pic-fallback' })).toBeInTheDocument()

    fireEvent.click(nextButton())
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})

describe('saved mode', () => {
  it('restores all mode from storage', () => {
    localStorage.setItem('czech-nouns-mode', 'all')
    render(<App />)

    expect(screen.getByRole('button', { name: /All 2000/ })).toHaveClass('active')
  })

  it('ignores unknown saved modes', () => {
    localStorage.setItem('czech-nouns-mode', 'invalid')
    render(<App />)

    expect(screen.getByRole('button', { name: /Pro děti/ })).toHaveClass('active')
  })

  it('still starts when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    render(<App />)

    expect(screen.getByRole('button', { name: /Pro děti/ })).toHaveClass('active')
  })

  it('still changes mode when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /All 2000/ }))

    expect(screen.getByRole('button', { name: /All 2000/ })).toHaveClass('active')
  })
})
