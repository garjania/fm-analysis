/**
 * Scaling trends data
 *
 * HOW TO ADD YOUR OWN DATA:
 *  1. Replace MODALITIES / X_LABELS / Y_LABELS with your real axis names.
 *  2. Replace or extend SCALING_DATA[xKey][yKey] with real arrays of {x, y} points.
 *     x = model scale (e.g. number of params or flops), y = performance metric.
 *  3. To add a completely new x→y pair just add the key inside SCALING_DATA.
 *
 * Data shape:
 *   SCALING_DATA[xKey][yKey] = Array<{ x: number, y: number, label?: string }>
 *   where x is model scale and y is the metric value.
 */

// ── Axis names ──────────────────────────────────────────────────────────────
export const X_LABELS = ['Text', 'Image', 'Audio', 'Video', 'Depth', 'Thermal', 'LiDAR'];
export const Y_LABELS = ['Text', 'Image', 'Audio', 'Video', 'Depth', 'Thermal', 'LiDAR'];

// X-axis label (model scale axis shown on the chart)
export const SCALE_AXIS_LABEL = 'Model Scale (B params)';
export const METRIC_AXIS_LABEL = 'Performance Score';

// ── Model scale points ───────────────────────────────────────────────────────
const SCALES = [0.5, 1, 2, 4, 7, 13, 30, 70];

// ── Utility: deterministic pseudo-random curve ───────────────────────────────
function makeCurve(seed, base, slope, noise) {
  return SCALES.map((s, i) => {
    const pseudo = Math.sin(seed * 17 + i * 3.7) * noise;
    const val = base + slope * Math.log2(s + 1) + pseudo;
    return { x: s, y: Math.max(0, Math.min(100, parseFloat(val.toFixed(2)))) };
  });
}

// ── Generate all 49 task curves ──────────────────────────────────────────────
function buildData() {
  const data = {};
  X_LABELS.forEach((xLabel, xi) => {
    data[xLabel] = {};
    Y_LABELS.forEach((yLabel, yi) => {
      const seed = xi * 7 + yi;
      // same-modality tasks tend to score higher
      const base = xi === yi ? 55 : 30 + (xi + yi) * 2;
      const slope = 8 + (seed % 6);
      const noise = 3 + (seed % 5);
      data[xLabel][yLabel] = makeCurve(seed, base, slope, noise);
    });
  });
  return data;
}

export const SCALING_DATA = buildData();

// ── Color palette (one per Y modality) ──────────────────────────────────────
export const PALETTE = [
  '#6c8ef5', '#f472b6', '#34d399', '#fbbf24',
  '#a78bfa', '#fb923c', '#22d3ee',
];
