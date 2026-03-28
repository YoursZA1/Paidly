import * as React from "react"

const MOBILE_BREAKPOINT = 768
/** Matches Tailwind `lg:` — sidebar hidden, bottom nav visible */
const COMPACT_LAYOUT_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange);
  }, [])

  return !!isMobile
}

/**
 * True when viewport is below `lg` (same as app shell: mobile header + bottom nav).
 * Used for gentler route transitions and compact-only UI tweaks.
 */
export function useIsCompactLayout() {
  const [matches, setMatches] = React.useState(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_LAYOUT_BREAKPOINT - 1}px)`)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener("change", onChange)
    setMatches(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return matches === undefined ? false : matches
}
