import { useEffect } from 'react'

export type Mood = 'night' | 'day'

/** Sets the page mood (drives the night/day theme transition). */
export function useMood(mood: Mood) {
  useEffect(() => {
    document.documentElement.dataset.mood = mood
  }, [mood])
}
