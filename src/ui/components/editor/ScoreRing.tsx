import type { Grade } from '../../../domain/cvAnalysis'

/** The CV score as a ring that fills up, colored by grade. */
export function ScoreRing({ score, tone, size = 40, stroke = 4, label = true }: { score: number; tone: Grade['tone']; size?: number; stroke?: number; label?: boolean }) {
  const radius = (size - stroke) / 2
  const length = 2 * Math.PI * radius
  return (
    <span className={`score-ring is-${tone}`} style={{ width: size, height: size }} role="img" aria-label={`Puntaje ${score} de 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="score-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="score-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.max(0, Math.min(100, score)) / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {label ? <span className="score-ring-number">{score}</span> : null}
    </span>
  )
}
