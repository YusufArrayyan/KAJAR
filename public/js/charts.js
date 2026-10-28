// Small SVG charts: thin bars, 4px rounded data ends on the baseline, recessive grid, hover tooltip,
// and always a table companion (dataviz rules: identity never by color alone).
import { html, raw, esc, fmt } from './app.js';

const W = 640;

function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// Path for a bar with rounded top corners only (data end), square at the baseline.
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// series: [{ name, cls, values: [] }], labels: [] (x categories)
export function bars({ labels, series, height = 200, label, every = 1, unit = '' }) {
  const H = height;
  const pad = { l: 32, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const group = iw / labels.length;
  const gap = 2; // surface gap between adjacent bars
  const bw = Math.max(3, Math.min(28, (group * 0.7 - gap * (series.length - 1)) / series.length));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  for (const t of ticks) {
    svg += `<line class="${t ? 'grid' : 'axis'}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt.num(t)}</text>`;
  }
  labels.forEach((lab, i) => {
    const gx = pad.l + group * i + (group - (bw * series.length + gap * (series.length - 1))) / 2;
    series.forEach((s, j) => {
      const v = s.values[i] || 0;
      const x = gx + j * (bw + gap);
      const tip = `${lab}${series.length > 1 ? ` · ${s.name}` : ''}: ${fmt.num(v)}${unit}`;
      svg += `<rect class="hit" x="${x - 3}" y="${pad.t}" width="${bw + 6}" height="${ih}" data-tip="${esc(tip)}"/>`;
      svg += `<path class="bar ${s.cls || ''}" d="${barPath(x, y(v), bw, pad.t + ih - y(v))}"/>`;
    });
    if (i % every === 0) svg += `<text x="${pad.l + group * i + group / 2}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
  });
  svg += '</svg>';
  const legend = series.length > 1 ? html`<div class="legend">${series.map((s) => html`<span><i class="${s.cls === 's2' ? 'c2' : 'c1'}"></i>${s.name}</span>`)}</div>` : '';
  return html`<figure class="chart" data-chart>${raw(svg)}${legend}</figure>`;
}

export function dataTable(head, rows, caption) {
  return html`<details class="table-toggle"><summary>Lihat tabel data</summary><div class="table-wrap"><table>
    ${caption ? html`<caption class="sr-only">${caption}</caption>` : ''}
    <thead><tr>${head.map((h, i) => html`<th class="${i ? 'n' : ''}" scope="col">${h}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => html`<td class="${i ? 'n' : ''}">${c}</td>`)}</tr>`)}</tbody></table></div></details>`;
}

// Hover tooltip for any [data-tip] inside a chart.
let tipEl;
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { if (tipEl) tipEl.hidden = true; return; }
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('aria-hidden', 'true');
    document.body.append(tipEl);
  }
  tipEl.textContent = t.dataset.tip;
  tipEl.hidden = false;
  const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, e.clientX + 12);
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${e.clientY - 36}px`;
});
