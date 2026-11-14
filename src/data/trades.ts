import type { Trade } from "../lib/types";

export const TRADES: Trade[] = [
  {
    id: "electrician",
    label: "Electrician",
    blurb: "Residential and commercial wiring, panels, conduit",
    hazards: ["electrical", "falling_objects", "flying_particles", "light_cuts", "kneeling"],
    optionalHazards: ["arc_flash", "noise", "nails_debris", "sharp_materials"],
  },
  {
    id: "carpenter",
    label: "Carpenter / framer",
    blurb: "Framing, decking, finish carpentry",
    hazards: ["falling_objects", "nails_debris", "noise", "flying_particles", "vibration_impact"],
    optionalHazards: ["kneeling", "wet", "light_cuts"],
  },
  {
    id: "laborer",
    label: "Construction laborer",
    blurb: "General site work, demo, concrete, cleanup",
    hazards: ["falling_objects", "nails_debris", "noise", "flying_particles", "vibration_impact", "traffic"],
    optionalHazards: ["wet", "sharp_materials", "highway"],
  },
  {
    id: "plumber",
    label: "Plumber / pipefitter",
    blurb: "Service calls, rough-in, drains",
    hazards: ["wet", "slippery", "flying_particles", "kneeling", "light_cuts", "chemicals"],
    optionalHazards: ["falling_objects", "noise", "welding"],
  },
  {
    id: "hvac",
    label: "HVAC technician",
    blurb: "Install and service, ductwork, attics and rooftops",
    hazards: ["sharp_materials", "electrical", "flying_particles", "kneeling"],
    optionalHazards: ["falling_objects", "noise", "welding"],
  },
  {
    id: "welder",
    label: "Welder / fabricator",
    blurb: "MIG, stick and TIG, shop or field",
    hazards: ["welding", "falling_objects", "flying_particles", "noise"],
    optionalHazards: ["sharp_materials", "slippery"],
  },
  {
    id: "roofer",
    label: "Roofer",
    blurb: "Shingle, metal and flat roofs",
    hazards: ["nails_debris", "slippery", "flying_particles", "light_cuts"],
    optionalHazards: ["noise", "falling_objects", "sharp_materials"],
  },
  {
    id: "warehouse",
    label: "Warehouse / forklift",
    blurb: "Picking, loading docks, forklifts",
    hazards: ["falling_objects", "traffic", "light_cuts", "slippery"],
    optionalHazards: ["noise", "vibration_impact"],
  },
  {
    id: "mechanic",
    label: "Auto / diesel mechanic",
    blurb: "Shop repair, oil, fluids and heavy parts",
    hazards: ["chemicals", "slippery", "flying_particles", "falling_objects"],
    optionalHazards: ["noise", "vibration_impact", "light_cuts"],
  },
  {
    id: "landscaper",
    label: "Landscaper",
    blurb: "Mowing, trimming, hardscape",
    hazards: ["noise", "flying_particles", "light_cuts", "wet"],
    optionalHazards: ["traffic", "falling_objects", "vibration_impact"],
  },
  {
    id: "road_crew",
    label: "Road crew / flagger",
    blurb: "Paving, traffic control, utility work near traffic",
    hazards: ["highway", "falling_objects", "noise", "flying_particles"],
    optionalHazards: ["nails_debris", "wet"],
  },
];

export function tradeById(id: string): Trade | undefined {
  return TRADES.find((t) => t.id === id);
}
