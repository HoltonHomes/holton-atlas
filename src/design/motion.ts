export const atlasMotion = {
  duration: {
    fast: 0.16,
    normal: 0.28,
    reveal: 0.52,
    cinematic: 0.72,
  },
  easing: {
    standard: [0.22, 1, 0.36, 1] as const,
    enter: [0.16, 1, 0.3, 1] as const,
  },
  spring: {
    gentle: { type: 'spring' as const, stiffness: 210, damping: 26, mass: 0.9 },
    responsive: { type: 'spring' as const, stiffness: 310, damping: 28, mass: 0.8 },
  },
}

export const atlasReveal = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: atlasMotion.duration.reveal, ease: atlasMotion.easing.enter },
}
