import type { Climate, EmployerRule, Hazard, Requirement } from "../lib/types";

export const HAZARDS: Hazard[] = [
  {
    id: "falling_objects",
    label: "Falling or rolling objects",
    requirements: [
      { category: "boots", feature: "safety_toe", hard: true, why: "OSHA 1910.136: protective toe (ASTM F2413 I/75 C/75) where objects can fall or roll on feet" },
      { category: "head", hard: true, why: "OSHA 1926.100: hard hat (ANSI Z89.1) where there is a risk of head injury from falling objects" },
    ],
  },
  {
    id: "electrical",
    label: "Live circuits / electrical work",
    requirements: [
      { category: "boots", feature: "eh", hard: true, why: "ASTM F2413 EH-rated sole adds a secondary barrier against open circuits up to 18,000 V" },
      { category: "head", feature: "class_e", hard: true, why: "ANSI Z89.1 Class E hard hat is tested to 20,000 V; Class C vented hats are not for electrical work" },
      { category: "eyewear", feature: "z87plus", hard: true, why: "Arcing and debris near panels call for ANSI Z87.1+ impact-rated eyewear" },
    ],
  },
  {
    id: "arc_flash",
    label: "Arc flash (energized panels, switchgear)",
    requirements: [
      { category: "shirt", feature: "fr", hard: true, why: "NFPA 70E requires arc-rated (ASTM F1506) clothing; regular cotton/poly can ignite and melt" },
      { category: "pants", feature: "fr", hard: true, why: "NFPA 70E: arc-rated pants (ASTM F1506)" },
    ],
  },
  {
    id: "flying_particles",
    label: "Flying chips, dust or debris",
    requirements: [
      { category: "eyewear", feature: "z87plus", hard: true, why: "OSHA 1910.133: eye protection meeting ANSI Z87.1; the '+' mark means high-impact rated" },
    ],
  },
  {
    id: "sharp_materials",
    label: "Sharp edges (sheet metal, glass, blades)",
    requirements: [
      { category: "gloves", minCut: 4, hard: true, why: "ANSI/ISEA 105 cut level A4+ is the common spec for sheet metal and glass handling" },
    ],
  },
  {
    id: "light_cuts",
    label: "Box cutters, light cuts and abrasion",
    requirements: [
      { category: "gloves", minCut: 2, hard: true, why: "ANSI/ISEA 105 cut level A2+ for utility knives, cardboard and light abrasion" },
    ],
  },
  {
    id: "nails_debris",
    label: "Nails, screws and sharp debris underfoot",
    requirements: [
      { category: "boots", feature: "puncture", hard: true, why: "ASTM F2413 PR (puncture-resistant) plate stops nails through the sole" },
    ],
  },
  {
    id: "slippery",
    label: "Wet, oily or slippery floors",
    requirements: [
      { category: "boots", feature: "slip", hard: true, why: "Slip-resistant outsole (ASTM F3445 / F2913 tested); slips are a top cause of lost-time injuries" },
    ],
  },
  {
    id: "wet",
    label: "Standing water, mud or rain",
    requirements: [
      { category: "boots", feature: "waterproof", hard: true, why: "Waterproof membrane keeps feet dry through a full shift, preventing blisters and trench foot" },
    ],
  },
  {
    id: "noise",
    label: "Loud tools or machines (85 dB+)",
    requirements: [
      { category: "hearing", minNrr: 22, hard: true, why: "OSHA 1910.95: hearing protection at 85 dBA over 8 hours; saws and grinders hit 95-110 dB" },
    ],
  },
  {
    id: "vibration_impact",
    label: "Heavy tools, pinch points, knuckle impacts",
    requirements: [
      { category: "gloves", feature: "impact", hard: true, why: "ANSI/ISEA 138 back-of-hand impact protection (TPR guards) for pinch points and dropped loads" },
    ],
  },
  {
    id: "welding",
    label: "Welding, cutting, sparks and spatter",
    requirements: [
      { category: "gloves", feature: "welding", hard: true, why: "Heat-resistant leather welding gloves for spatter and hot metal" },
      { category: "outerwear", feature: "fr", hard: true, why: "OSHA 1910.252: flame-resistant jacket; synthetics melt into skin when hit by spatter" },
      { category: "pants", feature: "fr", hard: false, why: "Flame-resistant or heavy cotton pants without cuffs that catch sparks" },
      { category: "eyewear", feature: "z87plus", hard: true, why: "Safety glasses under the welding hood for grinding and chipping slag (ANSI Z87.1+)" },
    ],
  },
  {
    id: "chemicals",
    label: "Oils, solvents and chemicals",
    requirements: [
      { category: "gloves", feature: "chemical", hard: true, why: "Nitrile chemical-resistant gloves for oils, fuels and solvents (OSHA 1910.138)" },
    ],
  },
  {
    id: "traffic",
    label: "Moving vehicles or forklifts",
    requirements: [
      { category: "hivis", minHivisClass: 2, hard: true, why: "ANSI/ISEA 107 Class 2 high-visibility garment around traffic and equipment" },
    ],
  },
  {
    id: "highway",
    label: "Highway work or night shifts",
    requirements: [
      { category: "hivis", minHivisClass: 3, hard: true, why: "ANSI/ISEA 107 Class 3 for traffic over 50 mph or low-light work (MUTCD / FHWA)" },
    ],
  },
  {
    id: "kneeling",
    label: "Lots of kneeling",
    requirements: [
      { category: "pants", feature: "knee_pads", hard: false, why: "Knee-pad pockets so pads stay in place, protecting against bursitis" },
    ],
  },
];

export const CLIMATE_REQUIREMENTS: Record<Climate, Requirement[]> = {
  hot: [
    { category: "shirt", feature: "lightweight", hard: false, why: "Light, moisture-wicking fabric lowers heat stress" },
    { category: "pants", feature: "lightweight", hard: false, why: "Lighter fabric for hot job sites" },
    { category: "eyewear", feature: "tinted", hard: false, why: "Tinted lenses for outdoor glare" },
  ],
  mild: [],
  cold: [
    { category: "outerwear", feature: "insulated", hard: true, why: "Insulated layer for sub-freezing work (OSHA cold stress guidance)" },
    { category: "boots", feature: "insulated", hard: false, why: "Insulated boots keep toes warm, especially with a steel cap" },
    { category: "gloves", feature: "insulated", hard: false, why: "Insulated gloves keep dexterity in the cold" },
    { category: "eyewear", feature: "anti_fog", hard: false, why: "Anti-fog coating for cold-to-warm transitions" },
  ],
  wet: [
    { category: "outerwear", feature: "waterproof", hard: true, why: "Waterproof shell for rain" },
    { category: "boots", feature: "waterproof", hard: false, why: "Waterproof boots for rainy sites" },
    { category: "eyewear", feature: "anti_fog", hard: false, why: "Anti-fog coating for humid conditions" },
  ],
};

export const EMPLOYER_RULES: { id: EmployerRule; label: string; requirements: Requirement[] }[] = [
  { id: "safety_toe", label: "Safety-toe boots", requirements: [{ category: "boots", feature: "safety_toe", hard: true, why: "Required by your employer" }] },
  { id: "composite_toe", label: "Non-metal (composite) toe", requirements: [{ category: "boots", feature: "composite_toe", hard: true, why: "Required by your employer (metal detectors, cold, or electrical sites)" }] },
  { id: "eh_boots", label: "EH-rated boots", requirements: [{ category: "boots", feature: "eh", hard: true, why: "Required by your employer" }] },
  { id: "waterproof_boots", label: "Waterproof boots", requirements: [{ category: "boots", feature: "waterproof", hard: true, why: "Required by your employer" }] },
  { id: "hard_hat", label: "Hard hat", requirements: [{ category: "head", hard: true, why: "Required by your employer" }] },
  { id: "hivis2", label: "Hi-vis Class 2", requirements: [{ category: "hivis", minHivisClass: 2, hard: true, why: "Required by your employer" }] },
  { id: "hivis3", label: "Hi-vis Class 3", requirements: [{ category: "hivis", minHivisClass: 3, hard: true, why: "Required by your employer" }] },
  { id: "fr", label: "FR / arc-rated clothing", requirements: [
    { category: "shirt", feature: "fr", hard: true, why: "Required by your employer" },
    { category: "pants", feature: "fr", hard: true, why: "Required by your employer" },
  ] },
];

export function hazardById(id: string): Hazard | undefined {
  return HAZARDS.find((h) => h.id === id);
}
