import type { CSSProperties } from "react";

/**
 * Inline CSS custom properties, e.g. cssVars({ "--i": 2 }). The entrance utilities in
 * globals.css read --i (position in a group), --stagger, --delay and --rise-y.
 */
export const cssVars = (vars: Record<`--${string}`, string | number>) => vars as CSSProperties;
