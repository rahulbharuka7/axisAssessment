import type { ReactNode } from 'react';

export const Logo = ({ light = false }: { light?: boolean }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16 }}>
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 1 L21 19 H14.5 L11 12 L7.5 19 H1 Z"
            fill={light ? '#fff' : 'var(--axis-burgundy-600)'} />
    </svg>
    <span style={{ color: light ? '#fff' : 'var(--axis-ink-900)', letterSpacing: '-.01em' }}>
      AXIS BANK
    </span>
  </span>
);

/** Shape + colour + label — survives greyscale and colour-vision deficiency. */
export const RiskPill = ({ band }: { band: string | null }) => {
  if (!band) return <span className="pill pill-neutral">◇ Not scored</span>;
  const map: Record<string, [string, string]> = {
    low: ['pill-low', '●'],
    medium: ['pill-medium', '◐'],
    high: ['pill-high', '▲'],
  };
  const [cls, glyph] = map[band] ?? ['pill-neutral', '◇'];
  return <span className={`pill ${cls}`}>{glyph} {band[0]!.toUpperCase() + band.slice(1)}</span>;
};

export const OutcomePill = ({ outcome }: { outcome: string | null }) => {
  if (outcome === 'pass') return <span className="pill pill-low">✓ Passed</span>;
  if (outcome === 'fail') return <span className="pill pill-high">✕ Not cleared</span>;
  if (outcome === 'inconclusive') return <span className="pill pill-medium">◐ Inconclusive</span>;
  return <span className="pill pill-neutral">◇ Pending</span>;
};

export const StatCard = ({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) => (
  <div className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
    <div className="label" style={{ marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
      {value}
    </div>
    {hint && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{hint}</div>}
  </div>
);

export const Banner = ({
  tone = 'info', title, children,
}: { tone?: 'info' | 'warning' | 'danger' | 'success' | 'brand'; title?: string; children: ReactNode }) => {
  const tones = {
    info:    ['var(--axis-info-50)', 'var(--axis-info-600)'],
    warning: ['var(--axis-warning-50)', 'var(--axis-warning-600)'],
    danger:  ['var(--axis-danger-50)', 'var(--axis-danger-600)'],
    success: ['var(--axis-success-50)', 'var(--axis-success-600)'],
    brand:   ['var(--axis-burgundy-50)', 'var(--axis-burgundy-600)'],
  } as const;
  const [bg, accent] = tones[tone];
  return (
    <div style={{
      background: bg, borderLeft: `3px solid ${accent}`,
      borderRadius: '0 var(--radius-md) var(--radius-md) 0',
      padding: 'var(--space-3) var(--space-4)', fontSize: 13.5,
    }}>
      {title && <div style={{ fontWeight: 600, color: accent, marginBottom: 2 }}>{title}</div>}
      <div style={{ color: 'var(--axis-ink-700)' }}>{children}</div>
    </div>
  );
};

export const SectionBar = ({ s }: { s: { score: number; max: number; cutoff: number | null; passed: boolean | null; competency: string } }) => {
  const pct = s.max > 0 ? (s.score / s.max) * 100 : 0;
  const pending = s.max === 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 92px', gap: 'var(--space-3)', alignItems: 'center' }}>
      <span style={{ fontSize: 13 }}>{s.competency}</span>
      <div style={{ position: 'relative', height: 8, background: 'var(--axis-burgundy-100)', borderRadius: 4 }}>
        {!pending && (
          <div style={{
            position: 'absolute', inset: '0 auto 0 0', width: `${Math.min(100, pct)}%`,
            background: s.passed === false ? 'var(--axis-danger-600)' : 'var(--axis-burgundy-600)',
            borderRadius: 4,
          }} />
        )}
        {s.cutoff !== null && s.max > 0 && (
          <div title={`cutoff ${s.cutoff}`} style={{
            position: 'absolute', top: -3, bottom: -3,
            left: `${Math.min(100, (s.cutoff / s.max) * 100)}%`,
            width: 2, background: 'var(--axis-ink-900)', opacity: .55,
          }} />
        )}
      </div>
      <span className="mono muted" style={{ fontSize: 12, textAlign: 'right' }}>
        {pending ? 'AI scoring' : `${s.score}/${s.max}`}
      </span>
    </div>
  );
};

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="card" style={{ padding: 'var(--space-7)', textAlign: 'center' }}>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>{title}</div>
    {children && <div className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>{children}</div>}
  </div>
);
