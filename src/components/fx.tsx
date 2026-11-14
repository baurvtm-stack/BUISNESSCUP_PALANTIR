"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cssVars } from "@/lib/css";
import { usd } from "@/lib/format";

/**
 * Small, dependency-free motion helpers shared by server and client pages.
 * Everything here honors prefers-reduced-motion and leaves content readable without JS.
 */

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type NumberKind = "usd" | "int";

function formatNumber(n: number, kind: NumberKind, digits: number): string {
  return kind === "usd" ? usd(n, digits) : n.toFixed(digits);
}

/**
 * A number that counts up when it first appears and glides to a new value when it changes.
 * The real value is always in the markup for screen readers and for the server render.
 */
export function AnimatedNumber({
  value,
  kind = "usd",
  digits = 0,
  duration = 900,
  delay = 0,
  countOnMount = true,
  startOnView = false,
  className = "",
}: {
  value: number;
  kind?: NumberKind;
  digits?: number;
  /** Length of the first count-up in ms; later changes are quicker. */
  duration?: number;
  delay?: number;
  /** False: show the value at once and only animate later changes. */
  countOnMount?: boolean;
  /** Wait until the number scrolls into view before counting. */
  startOnView?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const mounted = useRef(false);
  const [display, setDisplay] = useState(value);
  const [ready, setReady] = useState(!countOnMount);

  useLayoutEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    setReady(true);
    const from = first ? (countOnMount ? 0 : value) : shown.current;
    if (from === value || prefersReducedMotion()) {
      shown.current = value;
      setDisplay(value);
      return;
    }

    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    const length = first ? duration : Math.min(duration, 450);
    const show = (n: number) => {
      shown.current = n;
      setDisplay(n);
    };
    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / length);
        show(t === 1 ? value : from + (value - from) * (1 - Math.pow(1 - t, 4)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (first && delay > 0) timer = setTimeout(run, delay);
      else run();
    };

    show(from);
    if (first && startOnView && ref.current && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            start();
          }
        },
        { threshold: 0.6 },
      );
      observer.observe(ref.current);
    } else {
      start();
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [value, duration, delay, countOnMount, startOnView]);

  return (
    <span ref={ref} className={`tabular ${className}`}>
      <span className="sr-only">{formatNumber(value, kind, digits)}</span>
      <span aria-hidden data-num={ready ? undefined : "wait"}>
        {formatNumber(display, kind, digits)}
      </span>
    </span>
  );
}

// One observer for every Reveal on the page.
let revealObserver: IntersectionObserver | null = null;

function observeReveal(el: HTMLElement) {
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.reveal = "shown";
        revealObserver?.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  revealObserver.observe(el);
  return () => revealObserver?.unobserve(el);
}

/**
 * Fades its content up the first time it scrolls into view. Content already on screen
 * when the page loads is left alone, so nothing flashes and nothing waits on JS.
 */
export function Reveal({
  children,
  className = "",
  index = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Position in a group, for a staggered reveal. */
  index?: number;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.dataset.reveal = "pending";
    return observeReveal(el);
  }, []);

  return (
    // The ref type differs per tag; all of them are HTMLElements.
    <Tag ref={ref as never} className={className} style={index ? cssVars({ "--i": index }) : undefined}>
      {children}
    </Tag>
  );
}

const CONFETTI_COLORS = ["#ff6a13", "#15171a", "#ffb347", "#157f3c", "#f3f1ec", "#ff8f52"];

interface Piece {
  x: number;
  y: number;
  r: number;
  d: number;
  t: number;
  color: string;
  round: boolean;
}

/** A one-shot confetti burst from the top center of the nearest positioned parent. */
export function Confetti({ count = 44 }: { count?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    setPieces(
      Array.from({ length: count }, (_, i) => {
        const angle = Math.PI * (0.08 + 0.84 * Math.random());
        const reach = 110 + Math.random() * 230;
        return {
          x: Math.cos(angle) * reach * 1.25,
          y: -Math.sin(angle) * reach,
          r: (Math.random() - 0.5) * 900,
          d: Math.random() * 140,
          t: 1.4 + Math.random() * 0.9,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          round: i % 5 === 0,
        };
      }),
    );
    const timer = setTimeout(() => setPieces([]), 2800);
    return () => clearTimeout(timer);
  }, [count]);

  if (pieces.length === 0) return null;
  return (
    <span className="pointer-events-none absolute inset-x-0 top-10 z-50 block h-0" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            ...cssVars({
              "--x": `${p.x.toFixed(0)}px`,
              "--y": `${p.y.toFixed(0)}px`,
              "--r": `${p.r.toFixed(0)}deg`,
              "--d": `${p.d.toFixed(0)}ms`,
              "--t": `${p.t.toFixed(2)}s`,
            }),
            background: p.color,
            ...(p.round ? { borderRadius: 999, width: 9, height: 9 } : null),
          }}
        />
      ))}
    </span>
  );
}
