"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export { AnimatePresence } from "motion/react";
export * as m from "motion/react-m";

/** The shared easing of the CSS entrances, for Motion transitions. */
export const EASE = [0.2, 0.7, 0.2, 1] as const;

/**
 * Wraps a screen that uses Motion for exits and height changes (the questionnaire and the
 * kit page). Loads only the animation features, not layout or drag, and switches Motion's
 * transforms off for people who ask for reduced motion.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
