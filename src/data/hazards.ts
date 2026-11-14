import type { Climate, EmployerRule, Hazard, Requirement } from "../lib/types";

export const HAZARDS: Hazard[] = [
  {
    id: "falling_objects",
    label: "Falling or rolling objects",
    requirements: [
      { category: "boots", feature: "safety_toe", standard: "ASTM F2413", hard: true, why: "Protective toe for falling or rolling objects, using the ASTM F2413 rating recorded in the catalog" },
      { category: "head", standard: "ANSI Z89.1", hard: true, why: "ANSI Z89.1 hard hat for falling-object head hazards; select the appropriate type for your site" },
    ],
  },
  {
    id: "electrical",
    label: "Live circuits / electrical work",
    requirements: [
      { category: "boots", feature: "eh", standard: "ASTM F2413", hard: true, why: "EH-rated footwear provides secondary protection under dry conditions; it does not authorize energized work or replace electrical controls" },
      { category: "head", feature: "class_e", standard: "ANSI Z89.1", hard: true, why: "Class E electrical-rated hard hat; Class C vented hats do not provide that electrical rating" },
      { category: "eyewear", feature: "z87plus", standard: "ANSI Z87.1+", hard: true, why: "High-impact eyewear for debris near panels; it does not replace arc-flash face protection" },
    ],
  },
  {
    id: "arc_flash",
    label: "Arc flash (energized panels, switchgear)",
    requirements: [
      { category: "shirt", feature: "fr", standard: "ASTM F1506", hard: true, why: "Arc-rated shirt for an NFPA 70E risk assessment; the required arc rating must be confirmed for your task" },
      { category: "pants", feature: "fr", standard: "ASTM F1506", hard: true, why: "Arc-rated pants for an NFPA 70E risk assessment; confirm the incident-energy protection level" },
    ],
  },
  {
    id: "flying_particles",
    label: "Flying chips, dust or debris",
    requirements: [
      { category: "eyewear", feature: "z87plus", standard: "ANSI Z87.1+", hard: true, why: "ANSI Z87.1 high-impact eye protection, identified by the '+' rating" },
    ],
  },
  {
    id: "sharp_materials",
    label: "Sharp edges (sheet metal, glass, blades)",
    requirements: [
      { category: "gloves", minCut: 4, standard: "ANSI/ISEA 105", hard: true, why: "GearFit baseline A4+ cut resistance for sharp materials; your task assessment may require a higher level" },
    ],
  },
  {
    id: "light_cuts",
    label: "Box cutters, light cuts and abrasion",
    requirements: [
      { category: "gloves", minCut: 2, standard: "ANSI/ISEA 105", hard: true, why: "GearFit baseline A2+ cut resistance for handling tasks; gloves are cut resistant, not cut proof" },
    ],
  },
  {
    id: "nails_debris",
    label: "Nails, screws and sharp debris underfoot",
    requirements: [
      { category: "boots", feature: "puncture", standard: "ASTM F2413", hard: true, why: "ASTM F2413 PR-rated puncture resistance reduces underfoot penetration risk; it is not puncture proof" },
    ],
  },
  {
    id: "slippery",
    label: "Wet, oily or slippery floors",
    requirements: [
      { category: "boots", feature: "slip", hard: true, why: "Manufacturer-described slip-resistant outsole; performance depends on the floor and contaminants" },
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
      { category: "hearing", minNrr: 22, hard: true, why: "GearFit baseline NRR 22+; measured noise exposure, fit and attenuation determine adequate hearing protection" },
    ],
  },
  {
    id: "vibration_impact",
    label: "Heavy tools, pinch points, knuckle impacts",
    requirements: [
      { category: "gloves", feature: "impact", standard: "ANSI/ISEA 138", hard: true, why: "Rated back-of-hand impact protection; gloves do not prevent crushing or machinery entanglement" },
    ],
  },
  {
    id: "welding",
    label: "Welding, cutting, sparks and spatter",
    requirements: [
      { category: "gloves", feature: "welding", hard: true, why: "Heat-resistant leather welding gloves for spatter and hot metal" },
      { category: "outerwear", feature: "fr", hard: true, why: "OSHA 1910.252: flame-resistant jacket; synthetics melt into skin when hit by spatter" },
      { category: "pants", feature: "fr", hard: false, why: "Flame-resistant or heavy cotton pants without cuffs that catch sparks" },
      { category: "eyewear", feature: "z87plus", standard: "ANSI Z87.1+", hard: true, why: "Safety glasses under a separate appropriate welding hood for grinding and chipping slag" },
    ],
  },
  {
    id: "chemicals",
    label: "Oils, solvents and chemicals",
    requirements: [
      { category: "gloves", feature: "chemical", hard: true, why: "Chemical-resistant glove candidate; check the manufacturer's permeation data for the exact chemical and exposure duration" },
    ],
  },
  {
    id: "traffic",
    label: "Moving vehicles or forklifts",
    requirements: [
      { category: "hivis", minHivisClass: 2, standard: "ANSI/ISEA 107", hard: true, why: "GearFit baseline ANSI/ISEA 107 Class 2 visibility around traffic and equipment; confirm the site's garment type and class" },
    ],
  },
  {
    id: "highway",
    label: "Highway work or night shifts",
    requirements: [
      { category: "hivis", minHivisClass: 3, standard: "ANSI/ISEA 107", hard: true, why: "GearFit baseline ANSI/ISEA 107 Class 3 visibility for highway or low-light work; confirm site requirements" },
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
  { id: "safety_toe", label: "Safety-toe boots", requirements: [{ category: "boots", feature: "safety_toe", standard: "ASTM F2413", hard: true, why: "Required by your employer" }] },
  { id: "composite_toe", label: "Non-metal (composite) toe", requirements: [{ category: "boots", feature: "composite_toe", standard: "ASTM F2413", hard: true, why: "Composite safety toe required by your employer; this alone does not establish an electrical rating" }] },
  { id: "eh_boots", label: "EH-rated boots", requirements: [{ category: "boots", feature: "eh", standard: "ASTM F2413", hard: true, why: "Required by your employer" }] },
  { id: "waterproof_boots", label: "Waterproof boots", requirements: [{ category: "boots", feature: "waterproof", hard: true, why: "Required by your employer" }] },
  { id: "hard_hat", label: "Hard hat", requirements: [{ category: "head", standard: "ANSI Z89.1", hard: true, why: "Required by your employer" }] },
  { id: "hivis2", label: "Hi-vis Class 2", requirements: [{ category: "hivis", minHivisClass: 2, standard: "ANSI/ISEA 107", hard: true, why: "Required by your employer" }] },
  { id: "hivis3", label: "Hi-vis Class 3", requirements: [{ category: "hivis", minHivisClass: 3, standard: "ANSI/ISEA 107", hard: true, why: "Required by your employer" }] },
  { id: "fr", label: "FR / arc-rated clothing", requirements: [
    { category: "shirt", feature: "fr", standard: "ASTM F1506", hard: true, why: "Arc-rated clothing required by your employer; confirm the required arc rating" },
    { category: "pants", feature: "fr", standard: "ASTM F1506", hard: true, why: "Arc-rated clothing required by your employer; confirm the required arc rating" },
  ] },
];

export function hazardById(id: string): Hazard | undefined {
  return HAZARDS.find((h) => h.id === id);
}
