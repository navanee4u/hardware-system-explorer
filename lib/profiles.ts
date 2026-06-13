/**
 * profiles.ts — the single source of truth for how the three SWAP-C designs are
 * described to a human. Every component should pull profile labels, taglines,
 * and colors from here so naming is consistent and self-explanatory.
 *
 * The three profiles are three COMPLETE alternative designs of the same system,
 * each optimized for a different trade-off. All pass every hard requirement; they
 * differ only in which soft goal they lean into.
 */
import type { Profile } from "@/lib/schema";

export interface ProfileMeta {
  label: string; // short name as shown on a chip/column header
  tagline: string; // 2-4 word plain-English summary of the trade-off
  description: string; // one full sentence a newcomer instantly understands
  color: string; // accent color (matches the per-column theming)
}

export const PROFILE_META: Record<Profile, ProfileMeta> = {
  Efficiency: {
    label: "Efficiency",
    tagline: "Lowest power · longest runtime",
    description: "Optimized for the least power draw and the longest battery life.",
    color: "#0284c7",
  },
  Compact: {
    label: "Compact",
    tagline: "Smallest · lightest",
    description: "Optimized for the smallest size and the lightest weight.",
    color: "#6048f0",
  },
  Value: {
    label: "Value",
    tagline: "Cheapest · fastest to source",
    description: "Optimized for the lowest cost, shortest lead time, and fewest vendors.",
    color: "#b45309",
  },
};

/** One-line framing of what the three columns are, for headers/intros. */
export const THREE_DESIGNS_BLURB =
  "Three complete designs of your system — each optimized for a different trade-off. All pass every hard requirement; ranked #1–#3.";
