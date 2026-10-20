import { useCallback, useEffect, useRef, useState } from 'react'

export const SPEEDS = [0.5, 1, 2, 4] as const
const BASE_INTERVAL_MS = 1600

export interface Playback {
  t: number
  playing: boolean
  speed: number
  setT: (t: number) => void
  step: (delta: number) => void
  toggle: () => void
  setSpeed: (s: number) => void
}

/** Current step + play/pause + speed, with ←/→, space, Home/End shortcuts. */
export function usePlayback(nSteps: number, initial = 0): Playback {
  const [t, setTRaw] = useState(initial)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const last = nSteps - 1

  const setT = useCallback((x: number) => setTRaw(Math.max(0, Math.min(last, Math.round(x)))), [last])
  const step = useCallback((d: number) => { setPlaying(false); setTRaw((x) => Math.max(0, Math.min(last, x + d))) }, [last])
  const toggle = useCallback(() => {
    setPlaying((p) => {
      // Pressing play at the very end restarts from the beginning.
      if (!p) setTRaw((x) => (x >= last ? 0 : x))
      return !p
    })
  }, [last])

  useEffect(() => { if (t > last) setTRaw(last) }, [last, t])

  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setTRaw((x) => {
        if (x >= last) { setPlaying(false); return x }
        return x + 1
      })
    }, BASE_INTERVAL_MS / speed)
    return () => window.clearInterval(timer.current)
  }, [playing, speed, last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
      else if (e.key === ' ') { e.preventDefault(); toggle() }
      else if (e.key === 'Home') { e.preventDefault(); setPlaying(false); setT(0) }
      else if (e.key === 'End') { e.preventDefault(); setPlaying(false); setT(last) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, toggle, setT, last])

  return { t, playing, speed, setT: (x) => { setPlaying(false); setT(x) }, step, toggle, setSpeed }
}
