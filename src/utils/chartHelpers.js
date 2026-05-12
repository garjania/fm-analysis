/**
 * Shared Chart.js helpers
 */

/**
 * Returns Chart.js global defaults tuned for the dashboard theme.
 * Call once after Chart is imported.
 */
export function applyChartDefaults(Chart) {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-text2').trim() || '#8b92a8';
  Chart.defaults.borderColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-border').trim() || '#2a2f3f';
  // Mutate the existing animation descriptor — do NOT replace the whole object
  // or Chart.js loses its internal _fn reference and throws at runtime.
  Chart.defaults.animation.duration = 350;
  Chart.defaults.animation.easing = 'easeInOutQuart';
}

/**
 * Rebuilds chart colors from CSS variables (useful after theme switch).
 */
export function getCSSColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/**
 * Creates a dataset object for Chart.js line charts.
 */
export function makeDataset({ label, data, color, hidden = false }) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: hexToRgba(color, 0.08),
    pointBackgroundColor: color,
    pointBorderColor: color,
    pointRadius: 4,
    pointHoverRadius: 7,
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderWidth: 2,
    borderWidth: 2.5,
    tension: 0.35,
    fill: false,
    hidden,
  };
}

export function hexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Standard tooltip styling.
 */
export function tooltipPlugin(theme = 'dark') {
  const bg = theme === 'dark' ? '#1a1e2a' : '#ffffff';
  const border = theme === 'dark' ? '#2a2f3f' : '#d4d8e8';
  const text = theme === 'dark' ? '#e4e8f0' : '#1a1e2a';

  return {
    backgroundColor: bg,
    titleColor: text,
    bodyColor: text,
    borderColor: border,
    borderWidth: 1,
    padding: 12,
    cornerRadius: 8,
    titleFont: { weight: '600', size: 12 },
    bodyFont: { size: 12 },
    callbacks: {
      title(items) {
        const xVal = items[0]?.parsed.x;
        return `${xVal}% of CC12M`;
      },
      label(ctx) {
        return `  ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`;
      },
    },
  };
}
