import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'

const { renderRoot } = vi.hoisted(() => ({ renderRoot: vi.fn() }))

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: renderRoot })),
}))
vi.mock('./App', () => ({ default: () => null }))

beforeEach(() => {
  vi.resetModules()
  document.body.innerHTML = ''
})

it('mounts the app inside StrictMode', async () => {
  document.body.innerHTML = '<div id="root"></div>'

  await import('./main')

  expect(createRoot).toHaveBeenCalledWith(document.getElementById('root'))
  expect(renderRoot).toHaveBeenCalledWith(expect.objectContaining({ type: StrictMode }))
})

it('reports a missing root element', async () => {
  await expect(import('./main')).rejects.toThrow('Missing root element')

  expect(createRoot).not.toHaveBeenCalled()
})
