import type { ReactNode } from "react";
import type { Category, Feature } from "@/lib/types";

/**
 * Line illustrations for the nine gear categories, drawn in-house as inline SVG.
 *
 * They show the type of gear, not the exact product, so we never need retailer photos
 * (no licensing, no broken images, no layout shift). One 96 px grid and one stroke keep the
 * set consistent. Details change only with what the catalog says about the product: an
 * orange toe cap for a safety toe, a tinted lens, knee-pad patches, a hood on a rain shell.
 */

const INK = "var(--ink)";
const BODY = "var(--card)";
const SHADE = "var(--line)";
const SHADE_2 = "var(--line-2)";
const ACCENT = "var(--accent)";

/** The product fields the drawings read. Any catalog product or kit pick fits. */
export interface GearArtProduct {
  category: Category;
  name: string;
  features: Feature[];
  hivisClass?: 2 | 3;
}

type Has = (feature: Feature) => boolean;

function Boot({ has }: { has: Has }) {
  const upper = "M30 15h26v27c0 7 8 10 17 13 7 2.5 12 7 12 14v3H27V58c0-4 3-7 3-12z";
  const toe = has("safety_toe") || has("composite_toe");
  return (
    <>
      <ellipse cx="55" cy="85" rx="33" ry="2.5" fill={SHADE} stroke="none" />
      <path d="M33 15v-4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v4" />
      <path d={upper} fill={BODY} stroke="none" />
      {toe && <path d="M69.5 54c9 2.6 15.5 7 15.5 15v3H66c-.5-7 .5-13 3.5-18z" fill={ACCENT} stroke="none" />}
      <path d="M30 15h26v8H30z" fill={SHADE_2} stroke="none" />
      <path d={upper} />
      <path d="M69.5 54c-3 5-4 11-3.5 18" />
      {has("insulated") ? (
        <path d="M30 23c2.2 3 4.3 3 6.5 0 2.2 3 4.3 3 6.5 0 2.2 3 4.3 3 6.5 0 2.2 3 4.3 3 6.5 0" />
      ) : (
        <path d="M30 23h26" />
      )}
      <path d="M27.5 58c5 0 9 4 10 14" />
      <path d="M47 23v19M47 29h9M47 35h9M49 41.5h7.5" />
      <path d="M25 72h62v5a3 3 0 0 1-3 3H50l-3-3h-5v3H28a3 3 0 0 1-3-3z" fill={INK} />
    </>
  );
}

function Glove({ has }: { has: Has }) {
  const hand =
    "M36 72c-3-4-5-8-6-12l-7-11a4.2 4.2 0 0 1 7-4.6l4 5.6V26a4 4 0 0 1 8 0v-6a4.5 4.5 0 0 1 9 0v2a4.5 4.5 0 0 1 9 0v8a4.5 4.5 0 0 1 9 0v30c0 6-2 10-5 12z";
  const welding = has("welding");
  const long = welding || has("chemical");
  return (
    <>
      <path d={hand} fill={welding ? SHADE : BODY} />
      <path d="M42 26v20M51 22v24M60 30v16" />
      {has("impact") ? (
        <g fill={ACCENT} strokeWidth="2">
          <rect x="36" y="30" width="4" height="11" rx="2" />
          <rect x="44.5" y="24" width="4" height="17" rx="2" />
          <rect x="53.5" y="26" width="4" height="15" rx="2" />
          <rect x="62.5" y="34" width="4" height="8" rx="2" />
          <rect x="37" y="50" width="29" height="7" rx="3.5" />
        </g>
      ) : (
        <path d="M37 53c9-3 20-3 29 0" />
      )}
      {long ? (
        <path d="M35 72h30l5 15a2 2 0 0 1-2 2.5H32a2 2 0 0 1-2-2.5z" fill={welding ? SHADE_2 : ACCENT} />
      ) : (
        <>
          <path d="M34 72h32v9a3 3 0 0 1-3 3H37a3 3 0 0 1-3-3z" fill={ACCENT} />
          {has("insulated") && <path d="M34 72c2.3 3 4.6 3 6.4 0 2.3 3 4.6 3 6.4 0 2.3 3 4.6 3 6.4 0 2.3 3 4.6 3 6.4 0 2.3 3 4.6 3 6.4 0" />}
        </>
      )}
    </>
  );
}

function Glasses({ has }: { has: Has }) {
  const tinted = has("tinted");
  const lens = tinted ? "var(--ink-2)" : BODY;
  const glare = tinted ? "var(--card)" : SHADE_2;
  return (
    <>
      <path d="M13 41l-7-1.5v9M83 41l7-1.5v9" />
      <path d="M13 43c0-5 4-8 10-8h18c3.5 0 5 2 5 5.5C46 52 40 61 29.5 61 19.5 61 13 53 13 43z" fill={lens} />
      <path d="M83 43c0-5-4-8-10-8H55c-3.5 0-5 2-5 5.5C50 52 56 61 66.5 61 76.5 61 83 53 83 43z" fill={lens} />
      <path d="M46 40c.7-2 3.3-2 4 0" />
      <path d="M15 37.5C19 34.5 24 34 30 34h36c6 0 11 .5 15 3.5" stroke={ACCENT} strokeWidth="4" />
      <path d="M21 50l6-8M27 53l4-5.5M58 50l6-8M64 53l4-5.5" stroke={glare} strokeWidth="2" />
    </>
  );
}

function Earmuffs({ has }: { has: Has }) {
  const powered = has("electronic") || has("bluetooth");
  return (
    <>
      <path d="M22 50v-6a26 26 0 0 1 52 0v6" strokeWidth="5" />
      <path d="M22 50v-6a26 26 0 0 1 52 0v6" stroke={BODY} strokeWidth="1.5" />
      <rect x="27" y="50" width="7" height="28" rx="3.5" fill={INK} />
      <rect x="62" y="50" width="7" height="28" rx="3.5" fill={INK} />
      <rect x="11" y="46" width="19" height="36" rx="9" fill={ACCENT} />
      <rect x="66" y="46" width="19" height="36" rx="9" fill={ACCENT} />
      {powered ? (
        <>
          <circle cx="75.5" cy="56" r="2.5" fill={BODY} strokeWidth="2" />
          <path d="M72 66h7M72 71h7" strokeWidth="2" />
          <path d="M16.5 46V38" />
          <circle cx="16.5" cy="36" r="1.8" fill={INK} />
        </>
      ) : (
        <path d="M16.5 56v16M75.5 56v16" strokeWidth="2" />
      )}
    </>
  );
}

function Earplugs() {
  const plug = (
    <>
      <path d="M-7.5 13V-6a7.5 7.5 0 0 1 15 0v19a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z" fill={ACCENT} />
      <path d="M-7.5 8h15" />
    </>
  );
  return (
    <>
      <path d="M25 58c-4 34 50 34 46 0" />
      <g transform="translate(29 40) rotate(-20)">{plug}</g>
      <g transform="translate(67 40) rotate(20)">{plug}</g>
    </>
  );
}

function HardHat({ has, name }: { has: Has; name: string }) {
  const dome = "M22 61v-7c0-15 11.5-26 26-26s26 11 26 26v7z";
  const ridge = (
    <>
      <path d="M42 29c0-3 2.5-5 6-5s6 2 6 5v19H42z" fill={ACCENT} />
      <path d="M48 24v24" stroke={BODY} strokeWidth="1.5" />
    </>
  );
  if (has("type_2") && !/full brim/i.test(name)) {
    return (
      <>
        <path d="M24 60c1 14 12 24 24 24s23-10 24-24" stroke={SHADE_2} />
        <path d="M44 81.5h8" strokeWidth="4" />
        <path d="M20 62v-8c0-16 12.5-28 28-28s28 12 28 28v8z" fill={ACCENT} />
        <path d="M20 55h56" />
        <path d="M40 34v10M48 32v12M56 34v10" stroke={INK} strokeWidth="3" />
      </>
    );
  }
  if (/full brim/i.test(name)) {
    return (
      <>
        <ellipse cx="48" cy="64" rx="41" ry="8" fill={ACCENT} />
        <path d={dome} fill={ACCENT} stroke="none" />
        <path d="M22 62v-8c0-15 11.5-26 26-26s26 11 26 26v8" />
        <path d="M22 60c8 3.5 44 3.5 52 0" />
        {ridge}
      </>
    );
  }
  return (
    <>
      <path d="M18 61h60c7 0 11 3 12 8H18a4 4 0 0 1 0-8z" fill={ACCENT} />
      <path d={dome} fill={ACCENT} />
      {ridge}
      <path d="M22 54h52" />
    </>
  );
}

/** Reflective tape: the same light silver in both themes, inside an ink outline. */
const TAPE = { fill: "var(--steel-ink)", strokeWidth: 2 } as const;

function HiVis({ has, name, hivisClass }: { has: Has; name: string; hivisClass?: 2 | 3 }) {
  if (/jacket|bomber|parka|coat/i.test(name)) {
    return (
      <Jacket has={has} name={name} body={ACCENT}>
        <g {...TAPE}>
          <path d="M27 52h42v7H27z" />
          <path d="M12.5 43.5l9.5 2.5-1.5 6.5-9.5-2.5zM83.5 43.5L74 46l1.5 6.5 9.5-2.5z" />
        </g>
      </Jacket>
    );
  }
  const vest = "M33 14c0 12-5 20-11 24v44h52V38c-6-4-11-12-11-24H53l-5 17-5-17z";
  return (
    <>
      {hivisClass === 3 && (
        <>
          <path d="M31 20L11 31l5 15 12-5z" fill={ACCENT} />
          <path d="M65 20l20 11-5 15-12-5z" fill={ACCENT} />
          <path d="M13.2 37.6l12.5-5.5M82.8 37.6l-12.5-5.5" stroke={BODY} strokeWidth="2.5" />
        </>
      )}
      <path d={vest} fill={ACCENT} />
      <g {...TAPE}>
        <path d="M35.5 19h6v35h-6zM54.5 19h6v35h-6z" />
        <path d="M22 54h52v7H22z" />
        {hivisClass === 3 && <path d="M22 67h52v7H22z" />}
      </g>
      <path d="M48 31v51" />
    </>
  );
}

function FlameTag({ x, y }: { x: number; y: number }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M0-6c3.5 3 5 5.5 5 8.2a5 5 0 0 1-10 0c0-1.7.7-3 2-4.2.4 1.3 1 1.8 1.8 1.8C-.5-.2-1-3 0-6z"
      fill={ACCENT}
      strokeWidth="1.8"
    />
  );
}

function Jacket({ has, name, body = BODY, children }: { has: Has; name: string; body?: string; children?: ReactNode }) {
  const hooded = has("waterproof") || /hood/i.test(name);
  const trim = body === BODY ? SHADE_2 : body;
  const quilted = has("insulated") && !children;
  return (
    <>
      <path d="M28 20c-7 2-11 8-13 16L8 62l10 4 9-22z" fill={body} />
      <path d="M68 20c7 2 11 8 13 16l7 26-10 4-9-22z" fill={body} />
      <path d="M10 55l10 4M86 55l-10 4" />
      {hooded && <path d="M33 19C30 3 66 3 63 19z" fill={body} />}
      <path d="M34 16l-7 4v62h42V20l-7-4c-4 7-24 7-28 0z" fill={body} />
      {hooded ? (
        <path d="M38.5 18.5C37 9 59 9 57.5 18.5 54 23 42 23 38.5 18.5z" fill={trim} />
      ) : (
        <path d="M34 16l5-5h18l5 5c-4 7-24 7-28 0z" fill={trim} />
      )}
      {quilted && <path d="M30 37h36M30 50h36M30 63h36" stroke={SHADE_2} strokeWidth="2" />}
      <path d="M48 22v60" />
      <path d="M27 75h42" />
      {!quilted && !children && <path d="M33 58l5 9M63 58l-5 9" />}
      {children}
      {has("fr") && <FlameTag x={58} y={35} />}
    </>
  );
}

function Shirt({ has, name }: { has: Has; name: string }) {
  const tee = /\bT\b|tee|t-shirt/i.test(name);
  if (!tee) {
    return (
      <>
        <path d="M28 20c-7 2-11 8-13 16L8 62l10 4 9-22z" fill={BODY} />
        <path d="M68 20c7 2 11 8 13 16l7 26-10 4-9-22z" fill={BODY} />
        <path d="M10 55l10 4M86 55l-10 4" />
        <path d="M36 15l-9 5v62h42V20l-9-5-12 9z" fill={BODY} />
        <path d="M36 15l4-4.5 8 7.5-5.5 8zM60 15l-4-4.5-8 7.5 5.5 8z" fill={SHADE_2} />
        <path d="M48 24v58" />
        <path d="M48 35v.01M48 47v.01M48 59v.01M48 71v.01" strokeWidth="3.6" transform="translate(3.5 0)" />
        <path d="M31 38h10v9l-5 2.5-5-2.5z" fill={BODY} />
        <path d="M31 41.5h10" strokeWidth="2" />
        {has("fr") && <FlameTag x={61} y={42} />}
      </>
    );
  }
  const longSleeve = /long.sleeve/i.test(name);
  return (
    <>
      {longSleeve ? (
        <>
          <path d="M28 20c-7 2-11 8-13 16L8 62l10 4 9-22z" fill={BODY} />
          <path d="M68 20c7 2 11 8 13 16l7 26-10 4-9-22z" fill={BODY} />
          <path d="M10 55l10 4M86 55l-10 4" />
          <path d="M36 15l-9 5v62h42V20l-9-5c-3 8-21 8-24 0z" fill={BODY} />
        </>
      ) : (
        <path d="M36 15l-17 8-9 17 11 6 7-9v45h40V37l7 9 11-6-9-17-17-8c-3 8-21 8-24 0z" fill={BODY} />
      )}
      <path d="M36 15c3 8 21 8 24 0" />
      <path d="M40.5 16.5c3 4.5 12 4.5 15 0" stroke={SHADE_2} strokeWidth="2" />
      {/pocket/i.test(name) && <path d="M54 39h9v8l-4.5 2.5L54 47z" fill={SHADE} strokeWidth="2" />}
      <path d="M31 76h34" stroke={SHADE_2} strokeWidth="2" />
      {has("fr") && <FlameTag x={40} y={42} />}
    </>
  );
}

function Pants({ has, name }: { has: Has; name: string }) {
  const doubleFront = /double.(front|knee)/i.test(name) && !has("knee_pads");
  return (
    <>
      <path d="M30 13h36l4 71H54l-6-42-6 42H26z" fill={BODY} />
      {has("knee_pads") && (
        <>
          <path d="M28 50h19l-2 15H27.2z" fill={ACCENT} />
          <path d="M68 50H49l2 15h17.8z" fill={ACCENT} />
        </>
      )}
      <path d="M29.6 20.5h36.8" />
      <path d="M36 13v7.5M60 13v7.5M48 13v7.5" strokeWidth="2" />
      <path d="M48 20.5V34" />
      <path d="M34.5 20.5c0 5-2 8.5-5.3 9.5M61.5 20.5c0 5 2 8.5 5.3 9.5" />
      {doubleFront && (
        <>
          <path d="M28.3 44h19.4l-3.5 24H27z" fill={SHADE} strokeWidth="2" />
          <path d="M67.7 44H48.3l3.5 24H69z" fill={SHADE} strokeWidth="2" />
        </>
      )}
      {/cargo/i.test(name) && !has("knee_pads") && !doubleFront && (
        <>
          <path d="M28 46h8.5v11h-9.1" fill={SHADE} strokeWidth="2" />
          <path d="M68 46h-8.5v11h9.1" fill={SHADE} strokeWidth="2" />
        </>
      )}
      <path d="M29 78.5h11M56 78.5h11" stroke={SHADE_2} strokeWidth="2" />
      {has("fr") && <FlameTag x={58.5} y={38} />}
    </>
  );
}

function drawing(product: GearArtProduct): ReactNode {
  const has: Has = (feature) => product.features.includes(feature);
  const { name } = product;
  switch (product.category) {
    case "boots":
      return <Boot has={has} />;
    case "gloves":
      return <Glove has={has} />;
    case "eyewear":
      return <Glasses has={has} />;
    case "hearing":
      return /plug|bud/i.test(name) ? <Earplugs /> : <Earmuffs has={has} />;
    case "head":
      return <HardHat has={has} name={name} />;
    case "hivis":
      return <HiVis has={has} name={name} hivisClass={product.hivisClass} />;
    case "outerwear":
      return <Jacket has={has} name={name} />;
    case "shirt":
      return <Shirt has={has} name={name} />;
    case "pants":
      return <Pants has={has} name={name} />;
  }
}

/** An illustration of the type of gear, on a soft tile. Decorative: the product name carries the meaning. */
export default function GearArt({ product, className = "" }: { product: GearArtProduct; className?: string }) {
  return (
    <span className={`flex aspect-square shrink-0 items-center justify-center rounded-2xl bg-sunken ${className}`} aria-hidden>
      <svg
        viewBox="0 0 96 96"
        className="size-[86%]"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {drawing(product)}
      </svg>
    </span>
  );
}
