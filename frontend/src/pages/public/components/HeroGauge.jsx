export default function HeroGauge({ value, color = '#ef4d23', showLabels = false, min, max }) {
  const activeCount = Math.round((value / 100) * 40);

  const ticks = Array.from({ length: 40 }, (_, i) => {
    const angle = Math.PI + (i / 39) * Math.PI;
    return {
      x1: 100 + 70 * Math.cos(angle),
      y1: 100 + 70 * Math.sin(angle),
      x2: 100 + 80 * Math.cos(angle),
      y2: 100 + 80 * Math.sin(angle),
      active: i < activeCount,
    };
  });

  return (
    <div>
      <svg viewBox="0 0 200 120" style={{ maxWidth: 260, width: '100%' }}>
        {ticks.map((tick, i) => (
          <line
            key={i}
            x1={tick.x1} y1={tick.y1}
            x2={tick.x2} y2={tick.y2}
            stroke={tick.active ? color : '#d4d4d8'}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
        <text x="100" y="105" textAnchor="middle" fontSize="22" fontWeight="600" fill="#0f172a">
          {value}%
        </text>
      </svg>
      {showLabels && (
        <div className="flex justify-between text-[11px] text-neutral-500 -mt-1">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}
