import type { Category, Climate, Feature, Gender, Product } from "../lib/types";

/**
 * Hand-curated catalog of widely sold US workwear and PPE.
 * Prices are approximate street prices (late 2026); lifespans are GearFit
 * estimates at 40 h/week based on typical wear reports and manufacturer guidance.
 */
type Extra = Partial<Pick<Product, "cutLevel" | "nrr" | "hivisClass" | "pack" | "note">> & {
  goodFor?: Climate[];
};

function p(
  id: string,
  category: Category,
  brand: string,
  name: string,
  gender: Gender,
  price: number,
  lifespanMonths: number,
  quality: number,
  features: Feature[],
  standards: string[],
  extra: Extra = {},
): Product {
  return { id, category, brand, name, gender, price, lifespanMonths, quality, features, standards, ...extra };
}

const F2413 = "ASTM F2413";
const Z87 = "ANSI Z87.1+";
const Z89 = "ANSI Z89.1";
const ISEA105 = "ANSI/ISEA 105";
const ISEA107 = "ANSI/ISEA 107";
const F1506 = "ASTM F1506 / NFPA 70E";

export const PRODUCTS: Product[] = [
  // ---------- Boots ----------
  p("tb-pitboss-st", "boots", "Timberland PRO", "Pit Boss 6\" Steel Toe", "men", 135, 12, 6,
    ["safety_toe", "eh", "slip"], [`${F2413} I/75 C/75 EH`]),
  p("tb-boondock-ct-wp", "boots", "Timberland PRO", "Boondock 6\" Composite Toe Waterproof", "men", 215, 20, 8,
    ["safety_toe", "composite_toe", "eh", "slip", "waterproof"], [`${F2413} I/75 C/75 EH`], { goodFor: ["wet"] }),
  p("tb-boondock-ins", "boots", "Timberland PRO", "Boondock 8\" Insulated Waterproof Composite Toe", "men", 235, 20, 8,
    ["safety_toe", "composite_toe", "eh", "slip", "waterproof", "insulated"], [`${F2413} I/75 C/75 EH`], { goodFor: ["cold", "wet"] }),
  p("tb-endurance-pr", "boots", "Timberland PRO", "Endurance 6\" PR Steel Toe", "men", 150, 14, 7,
    ["safety_toe", "eh", "puncture", "slip"], [`${F2413} I/75 C/75 EH PR`]),
  p("keen-pittsburgh", "boots", "KEEN Utility", "Pittsburgh 6\" Waterproof Steel Toe", "men", 195, 16, 7,
    ["safety_toe", "eh", "slip", "waterproof"], [`${F2413} I/75 C/75 EH`], { goodFor: ["wet"] }),
  p("carhartt-rf-ct-wp", "boots", "Carhartt", "Rugged Flex 6\" Waterproof Composite Toe", "men", 170, 14, 7,
    ["safety_toe", "composite_toe", "eh", "slip", "waterproof"], [`${F2413} I/75 C/75 EH`], { goodFor: ["wet"] }),
  p("cat-second-shift", "boots", "Caterpillar", "Second Shift Steel Toe", "men", 110, 9, 5,
    ["safety_toe", "eh", "slip"], [`${F2413} I/75 C/75 EH`]),
  p("cat-threshold-wp", "boots", "Caterpillar", "Threshold Waterproof Steel Toe", "men", 135, 11, 6,
    ["safety_toe", "eh", "slip", "waterproof"], [`${F2413} I/75 C/75 EH`], { goodFor: ["wet"] }),
  p("wolverine-overpass", "boots", "Wolverine", "Overpass 6\" Composite Toe Waterproof", "men", 175, 15, 7,
    ["safety_toe", "composite_toe", "eh", "slip", "waterproof"], [`${F2413} I/75 C/75 EH`], { goodFor: ["wet"] }),
  p("wolverine-floorhand-ins", "boots", "Wolverine", "Floorhand Insulated 6\" Waterproof Steel Toe", "men", 165, 14, 7,
    ["safety_toe", "eh", "slip", "waterproof", "insulated"], [`${F2413} I/75 C/75 EH`], { goodFor: ["cold", "wet"] }),
  p("redwing-supersole", "boots", "Red Wing", "SuperSole 6\" Safety Toe", "men", 300, 30, 9,
    ["safety_toe", "eh", "slip"], [`${F2413} I/75 C/75 EH`], { note: "Resoleable: one resole (~$100) roughly doubles life." }),
  p("thorogood-moc", "boots", "Thorogood", "American Heritage 6\" Moc Toe Safety Toe", "men", 280, 30, 9,
    ["safety_toe", "eh", "slip"], [`${F2413} I/75 C/75 EH`], { note: "Made in USA, resoleable." }),
  p("irishsetter-ashby", "boots", "Irish Setter", "Ashby 6\" Waterproof Aluminum Toe", "men", 180, 15, 7,
    ["safety_toe", "eh", "slip", "waterproof"], [`${F2413} I/75 C/75 EH`], { goodFor: ["wet"] }),
  p("tb-titan-w", "boots", "Timberland PRO", "Women's Titan 6\" Composite Toe", "women", 140, 12, 6,
    ["safety_toe", "composite_toe", "eh", "slip"], [`${F2413} I/75 C/75 EH`]),
  p("keen-flint-w", "boots", "KEEN Utility", "Women's Flint II Steel Toe", "women", 160, 12, 7,
    ["safety_toe", "eh", "slip"], [`${F2413} I/75 C/75 EH`]),
  p("carhartt-rf-wp-w", "boots", "Carhartt", "Women's Rugged Flex 6\" Waterproof Composite Toe", "women", 165, 13, 7,
    ["safety_toe", "composite_toe", "eh", "slip", "waterproof"], [`${F2413} I/75 C/75 EH`], { goodFor: ["wet"] }),

  // ---------- Gloves ----------
  p("ansell-11840", "gloves", "Ansell", "HyFlex 11-840 Nitrile Foam Grip", "unisex", 45, 6, 7,
    ["touchscreen"], [`${ISEA105} A1`], { cutLevel: 1, pack: "12 pairs" }),
  p("milwaukee-cut3", "gloves", "Milwaukee", "Cut Level 3 Nitrile Dipped Gloves", "unisex", 55, 6, 7,
    ["touchscreen"], [`${ISEA105} A3`], { cutLevel: 3, pack: "12 pairs" }),
  p("milwaukee-cut5", "gloves", "Milwaukee", "Cut Level 5 High-Dexterity Nitrile Dipped", "unisex", 85, 7, 8,
    ["touchscreen"], [`${ISEA105} A5`], { cutLevel: 5, pack: "12 pairs" }),
  p("milwaukee-impact-cut5", "gloves", "Milwaukee", "Impact Cut Level 5 Nitrile Dipped Gloves", "unisex", 35, 5, 8,
    ["impact", "touchscreen"], [`${ISEA105} A5`, "ANSI/ISEA 138"], { cutLevel: 5 }),
  p("mechanix-mpact", "gloves", "Mechanix Wear", "M-Pact Impact Gloves", "unisex", 32, 4, 7,
    ["impact", "touchscreen"], ["ANSI/ISEA 138"], { cutLevel: 1 }),
  p("ironclad-command-impact", "gloves", "Ironclad", "Command Impact Gloves", "unisex", 35, 5, 7,
    ["impact", "touchscreen"], ["ANSI/ISEA 138"], { cutLevel: 1 }),
  p("wells-hydrahyde", "gloves", "Wells Lamont", "HydraHyde Leather Work Gloves", "unisex", 15, 3, 5,
    [], ["General purpose"], { cutLevel: 1 }),
  p("carhartt-ins-grip", "gloves", "Carhartt", "W.P. Waterproof Insulated Gloves", "unisex", 35, 8, 7,
    ["insulated", "waterproof"], ["General purpose"], { goodFor: ["cold", "wet"] }),
  p("mechanix-coldwork-mpact", "gloves", "Mechanix Wear", "ColdWork M-Pact Insulated Gloves", "unisex", 45, 6, 7,
    ["insulated", "impact", "touchscreen"], ["ANSI/ISEA 138"], { cutLevel: 1, goodFor: ["cold"] }),
  p("lincoln-mig-stick", "gloves", "Lincoln Electric", "Heavy Duty MIG/Stick Welding Gloves", "unisex", 20, 3, 6,
    ["welding"], ["Heat-resistant leather"]),
  p("caiman-1878", "gloves", "Caiman", "1878 MIG/Stick Deerskin Welding Gloves", "unisex", 30, 5, 8,
    ["welding"], ["Heat-resistant leather"]),
  p("ammex-nitrile", "gloves", "AMMEX", "Gloveworks HD Black Nitrile Disposable", "unisex", 20, 1.5, 6,
    ["chemical"], ["ASTM D6319"], { pack: "100 gloves" }),
  p("showa-730", "gloves", "SHOWA", "730 Chemical-Resistant Nitrile", "unisex", 10, 3, 7,
    ["chemical", "waterproof"], ["EN 374 / chemical resistant"], { goodFor: ["wet"] }),

  // ---------- Eyewear ----------
  p("3m-sf401af", "eyewear", "3M", "SecureFit 400 Anti-Fog, Clear", "unisex", 8, 4, 7,
    ["z87plus", "anti_fog"], [Z87]),
  p("3m-sf402af", "eyewear", "3M", "SecureFit 400 Anti-Fog, Gray", "unisex", 8, 4, 7,
    ["z87plus", "anti_fog", "tinted"], [Z87], { goodFor: ["hot"] }),
  p("pyramex-ztek", "eyewear", "Pyramex", "Ztek Safety Glasses, Clear", "unisex", 25, 18, 5,
    ["z87plus"], [Z87], { pack: "12 pairs" }),
  p("uvex-genesis", "eyewear", "Uvex", "Genesis Anti-Fog, Clear", "unisex", 13, 6, 8,
    ["z87plus", "anti_fog"], [Z87]),
  p("dewalt-concealer", "eyewear", "DEWALT", "Concealer Anti-Fog, Clear", "unisex", 12, 5, 7,
    ["z87plus", "anti_fog"], [Z87]),
  p("wileyx-saber", "eyewear", "Wiley X", "Saber Advanced, Smoke Grey", "unisex", 45, 12, 9,
    ["z87plus", "tinted"], [Z87], { goodFor: ["hot"] }),

  // ---------- Hearing ----------
  p("3m-ear-classic", "hearing", "3M", "E-A-R Classic Foam Earplugs", "unisex", 32, 10, 6,
    [], ["NRR 29 dB"], { nrr: 29, pack: "200 pairs" }),
  p("hl-laserlite", "hearing", "Howard Leight", "Laser Lite Foam Earplugs", "unisex", 30, 10, 6,
    [], ["NRR 32 dB"], { nrr: 32, pack: "200 pairs" }),
  p("3m-x4a", "hearing", "3M", "Peltor X4A Earmuffs", "unisex", 30, 24, 8,
    [], ["NRR 27 dB"], { nrr: 27 }),
  p("3m-x5a", "hearing", "3M", "Peltor X5A Earmuffs", "unisex", 40, 24, 8,
    [], ["NRR 31 dB"], { nrr: 31 }),
  p("hl-impact-sport", "hearing", "Howard Leight", "Impact Sport Electronic Earmuffs", "unisex", 55, 24, 7,
    ["electronic"], ["NRR 22 dB"], { nrr: 22 }),
  p("3m-worktunes", "hearing", "3M", "WorkTunes Connect Bluetooth", "unisex", 60, 24, 7,
    ["bluetooth"], ["NRR 24 dB"], { nrr: 24 }),
  p("isotunes-pro2", "hearing", "ISOtunes", "PRO 2.0 Bluetooth Earbuds", "unisex", 100, 18, 8,
    ["bluetooth"], ["NRR 27 dB"], { nrr: 27 }),

  // ---------- Head ----------
  p("msa-vgard-cap", "head", "MSA", "V-Gard Cap Style, Fas-Trac III", "unisex", 28, 48, 8,
    ["class_e"], [`${Z89} Type I Class E`], { note: "Replace suspension yearly, shell every 5 years." }),
  p("msa-vgard-brim", "head", "MSA", "V-Gard Full Brim, Fas-Trac III", "unisex", 35, 48, 8,
    ["class_e"], [`${Z89} Type I Class E`], { goodFor: ["hot", "wet"] }),
  p("pyramex-ridgeline", "head", "Pyramex", "Ridgeline Cap Style Hard Hat", "unisex", 22, 36, 6,
    ["class_e"], [`${Z89} Type I Class E`]),
  p("3m-h701v", "head", "3M", "SecureFit H-701V Vented Hard Hat", "unisex", 25, 36, 7,
    [], [`${Z89} Type I Class C`], { goodFor: ["hot"] }),
  p("milwaukee-bolt-t2", "head", "Milwaukee", "BOLT Type 2 Class E Hard Hat", "unisex", 60, 48, 8,
    ["class_e", "type_2"], [`${Z89} Type II Class E`]),
  p("studson-shk1", "head", "Studson", "SHK-1 Type 2 Class E Safety Helmet", "unisex", 140, 48, 9,
    ["class_e", "type_2"], [`${Z89} Type II Class E`]),

  // ---------- Hi-vis ----------
  p("radians-sv2z", "hivis", "Radians", "SV2Z Class 2 Mesh Vest", "unisex", 9, 4, 5,
    ["hivis"], [`${ISEA107} Class 2`], { hivisClass: 2 }),
  p("ergodyne-8210hl", "hivis", "Ergodyne", "GloWear 8210HL Class 2 Vest", "unisex", 12, 6, 6,
    ["hivis"], [`${ISEA107} Class 2`], { hivisClass: 2 }),
  p("ergodyne-8310hl", "hivis", "Ergodyne", "GloWear 8310HL Class 3 Vest", "unisex", 22, 6, 7,
    ["hivis"], [`${ISEA107} Class 3`], { hivisClass: 3 }),
  p("radians-sv55", "hivis", "Radians", "SV55 Class 3 Surveyor Vest", "unisex", 25, 8, 7,
    ["hivis"], [`${ISEA107} Class 3`], { hivisClass: 3 }),
  p("ergodyne-8385", "hivis", "Ergodyne", "GloWear 8385 Class 3 Thermal Bomber Jacket", "unisex", 85, 24, 7,
    ["hivis", "insulated", "waterproof"], [`${ISEA107} Class 3`], { hivisClass: 3, goodFor: ["cold", "wet"] }),

  // ---------- Outerwear ----------
  p("carhartt-j131", "outerwear", "Carhartt", "Duck Active Jac, Thermal-Lined", "men", 135, 36, 9,
    ["insulated"], ["Firm duck, thermal lining"], { goodFor: ["cold"] }),
  p("dickies-sherpa", "outerwear", "Dickies", "Sherpa-Lined Duck Hooded Jacket", "men", 80, 24, 6,
    ["insulated"], ["Duck canvas, sherpa lining"], { goodFor: ["cold"] }),
  p("carhartt-shoreline", "outerwear", "Carhartt", "Storm Defender Shoreline Jacket", "men", 100, 24, 7,
    ["waterproof"], ["Waterproof, sealed seams"], { goodFor: ["wet"] }),
  p("froggtoggs-pro", "outerwear", "Frogg Toggs", "Pro Action Rain Jacket", "unisex", 40, 12, 5,
    ["waterproof"], ["Waterproof, breathable"], { goodFor: ["wet"] }),
  p("carhartt-active-w", "outerwear", "Carhartt", "Women's Washed Duck Active Jac", "women", 120, 36, 8,
    ["insulated"], ["Washed duck, quilted lining"], { goodFor: ["cold"] }),
  p("carhartt-rain-w", "outerwear", "Carhartt", "Women's Storm Defender Rain Jacket", "women", 110, 24, 7,
    ["waterproof"], ["Waterproof, sealed seams"], { goodFor: ["wet"] }),
  p("carhartt-fr-active", "outerwear", "Carhartt", "FR Duck Active Jac, Quilt-Lined", "unisex", 250, 36, 9,
    ["fr", "insulated"], [F1506], { goodFor: ["cold"] }),
  p("lincoln-fr-jacket", "outerwear", "Lincoln Electric", "FR Cotton Welding Jacket", "unisex", 45, 12, 6,
    ["fr"], ["NFPA 2112 / ASTM D6413"]),
  p("blackstallion-hybrid", "outerwear", "Revco Black Stallion", "Cotton/Leather Hybrid Welding Jacket", "unisex", 80, 24, 8,
    ["fr"], ["ASTM D6413 flame resistant"]),

  // ---------- Shirts ----------
  p("carhartt-force-t", "shirt", "Carhartt", "Force Relaxed Fit Midweight Pocket T", "men", 25, 12, 7,
    ["lightweight"], ["Fast-dry, odor control"], { goodFor: ["hot"] }),
  p("carhartt-k87", "shirt", "Carhartt", "Loose Fit Heavyweight Pocket T (K87)", "men", 22, 12, 8,
    [], ["Heavyweight cotton"]),
  p("dickies-heavy-t", "shirt", "Dickies", "Short Sleeve Heavyweight Crew Tee", "men", 15, 9, 5,
    [], ["Heavyweight cotton"]),
  p("carhartt-force-t-w", "shirt", "Carhartt", "Women's Force Relaxed Fit Midweight T", "women", 25, 12, 7,
    ["lightweight"], ["Fast-dry, odor control"], { goodFor: ["hot"] }),
  p("carhartt-heavy-t-w", "shirt", "Carhartt", "Women's Loose Fit Heavyweight T", "women", 22, 12, 8,
    [], ["Heavyweight cotton"]),
  p("carhartt-fr-force", "shirt", "Carhartt", "FR Force Long-Sleeve T-Shirt", "men", 65, 12, 8,
    ["fr", "lightweight"], [F1506, "ATPV ~8 cal/cm²"], { goodFor: ["hot"] }),
  p("bulwark-fr-shirt", "shirt", "Bulwark", "FR Lightweight Work Shirt", "men", 70, 18, 8,
    ["fr"], [F1506, "ATPV ~8 cal/cm²"]),
  p("bulwark-fr-shirt-w", "shirt", "Bulwark", "Women's FR Work Shirt", "women", 75, 18, 8,
    ["fr"], [F1506, "ATPV ~8 cal/cm²"]),

  // ---------- Pants ----------
  p("carhartt-b01", "pants", "Carhartt", "Loose Fit Firm Duck Double-Front (B01)", "men", 60, 18, 8,
    [], ["12 oz firm duck, double front"]),
  p("carhartt-rigby-df", "pants", "Carhartt", "Rugged Flex Rigby Double-Front", "men", 70, 15, 8,
    ["knee_pads", "stretch"], ["Stretch duck, knee-pad pockets"]),
  p("dickies-874", "pants", "Dickies", "874 Original Work Pant", "men", 30, 10, 6,
    [], ["Poly/cotton twill"]),
  p("dickies-flex-dk", "pants", "Dickies", "FLEX Double Knee Work Pant", "men", 40, 11, 6,
    ["stretch"], ["Double knee twill"]),
  p("duluth-firehose", "pants", "Duluth Trading", "DuluthFlex Fire Hose Work Pants", "men", 90, 24, 9,
    ["stretch", "knee_pads"], ["Fire hose canvas, knee-pad pockets"]),
  p("wrangler-riggs", "pants", "Wrangler RIGGS", "Ripstop Ranger Cargo Pant", "men", 40, 12, 6,
    ["lightweight"], ["Ripstop cotton"], { goodFor: ["hot"] }),
  p("carhartt-force-ripstop", "pants", "Carhartt", "Force Relaxed Fit Ripstop Cargo", "men", 55, 12, 7,
    ["lightweight", "stretch"], ["Lightweight ripstop, quick-dry"], { goodFor: ["hot"] }),
  p("carhartt-fr-canvas", "pants", "Carhartt", "FR Rugged Flex Canvas Pant", "men", 95, 18, 8,
    ["fr", "stretch"], [F1506]),
  p("bulwark-fr-excel", "pants", "Bulwark", "FR EXCEL FR Work Pant", "men", 75, 18, 8,
    ["fr"], [F1506]),
  p("carhartt-rf-df-w", "pants", "Carhartt", "Women's Rugged Flex Relaxed Fit Double-Front", "women", 60, 15, 8,
    ["stretch"], ["Stretch canvas, double front"]),
  p("duluth-firehose-w", "pants", "Duluth Trading", "Women's DuluthFlex Fire Hose Work Pants", "women", 90, 24, 9,
    ["stretch", "knee_pads"], ["Fire hose canvas, knee-pad pockets"]),
  p("dickies-stretch-w", "pants", "Dickies", "Women's Relaxed Straight Stretch Twill", "women", 35, 10, 6,
    ["stretch"], ["Stretch twill"]),
  p("carhartt-force-w", "pants", "Carhartt", "Women's Force Relaxed Fit Lightweight Ripstop", "women", 50, 12, 7,
    ["lightweight", "stretch"], ["Lightweight ripstop, quick-dry"], { goodFor: ["hot"] }),
  p("bulwark-fr-pant-w", "pants", "Bulwark", "Women's FR Work Pant", "women", 80, 18, 8,
    ["fr"], [F1506]),
];

export function buyUrl(product: Product): string {
  const q = encodeURIComponent(`${product.brand} ${product.name}`);
  return `https://www.amazon.com/s?k=${q}`;
}
