/**
 * Section registry
 *
 * HOW TO ADD A NEW SECTION:
 *  1. Create your section module in src/sections/yourSection.js
 *     and export an object matching the Section interface below.
 *  2. Import it here and add it to SECTIONS.
 *
 * Section interface:
 * {
 *   id:      string          — unique slug used for routing & DOM ids
 *   title:   string          — human-readable name shown in sidebar
 *   icon:    string          — inline SVG string
 *   badge?:  string          — optional badge text (e.g. "new", "49 tasks")
 *   render:  (container: HTMLElement) => void
 *   onThemeChange?: () => void   — called when the user switches theme
 * }
 */

import { scalingTrendsSection } from './sections/scalingTrends.js';

// ── Register sections in display order ──────────────────────────────────────
export const SECTIONS = [
  scalingTrendsSection,
  // ← add more sections here
];
