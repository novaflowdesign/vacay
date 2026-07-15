import { useState } from 'react';
import { formatMoney } from '../../lib/format';

interface DonutSlice {
  label: string;
  icon: string | null;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  total: number;
  currency: string;
}

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 70;
const STROKE = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3;

export default function DonutChart({ slices, total, currency }: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (total <= 0 || slices.length === 0) {
    return null;
  }

  let cumulative = 0;
  const segments = slices.map((slice, i) => {
    const fraction = slice.value / total;
    const length = fraction * CIRCUMFERENCE;
    const offset = cumulative;
    cumulative += length;
    const midAngle = ((offset + length / 2) / CIRCUMFERENCE) * 360;
    return { ...slice, length, offset, midAngle, index: i };
  });

  const activeSegment = hovered !== null ? segments[hovered] : null;
  const tooltipAngleRad = activeSegment ? ((activeSegment.midAngle - 90) * Math.PI) / 180 : 0;
  const tooltipRadius = RADIUS + STROKE / 2 + 20;
  const tooltipX = CENTER + tooltipRadius * Math.cos(tooltipAngleRad);
  const tooltipY = CENTER + tooltipRadius * Math.sin(tooltipAngleRad);

  return (
    <div className="donut-chart">
      <div className="donut-chart__plot">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut-chart__svg">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="rgba(17, 24, 39, 0.06)"
            strokeWidth={STROKE}
          />
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            {segments.map((seg) => (
              <circle
                key={seg.label}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={seg.color}
                strokeWidth={hovered === seg.index ? STROKE + 4 : STROKE}
                strokeDasharray={`${Math.max(seg.length - GAP, 0)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-seg.offset}
                strokeLinecap="butt"
                tabIndex={0}
                role="img"
                aria-label={`${seg.label}: ${formatMoney(seg.value, currency)}`}
                className="donut-chart__segment"
                onMouseEnter={() => setHovered(seg.index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(seg.index)}
                onBlur={() => setHovered(null)}
              />
            ))}
          </g>
        </svg>

        <div className="donut-chart__center">
          <span className="donut-chart__center-label">
            {activeSegment ? activeSegment.label : 'Łącznie'}
          </span>
          <span className="donut-chart__center-value">
            {formatMoney(activeSegment ? activeSegment.value : total, currency)}
          </span>
        </div>

        {activeSegment && (
          <div
            className="donut-chart__tooltip"
            style={{ left: `${(tooltipX / SIZE) * 100}%`, top: `${(tooltipY / SIZE) * 100}%` }}
          >
            <strong>{formatMoney(activeSegment.value, currency)}</strong>
            <span>
              {activeSegment.icon ?? '🛒'} {activeSegment.label}
            </span>
          </div>
        )}
      </div>

      <div className="donut-chart__legend">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`donut-chart__legend-item ${hovered === seg.index ? 'donut-chart__legend-item--active' : ''}`}
            onMouseEnter={() => setHovered(seg.index)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="donut-chart__legend-dot" style={{ background: seg.color }} />
            <span className="donut-chart__legend-label">
              {seg.icon ?? '🛒'} {seg.label}
            </span>
            <span className="donut-chart__legend-value">{formatMoney(seg.value, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
