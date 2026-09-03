import { useEffect, useState } from 'react';
import { mintToken, type Role } from './lib/api';
import { Logo } from './components/ui';
import { Admin } from './personas/Admin';
import { Recruiter } from './personas/Recruiter';
import { Candidate } from './personas/Candidate';

const PERSONAS: { role: Role; sub: string; label: string; blurb: string }[] = [
  { role: 'TA_ADMIN',  sub: 'admin-001', label: 'TA-Admin',  blurb: 'Set the rules' },
  { role: 'RECRUITER', sub: 'rec-001',   label: 'Recruiter', blurb: 'Run the hiring' },
  { role: 'CANDIDATE', sub: 'cand-100',  label: 'Candidate', blurb: 'Take the test' },
];

export const App = () => {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const persona = PERSONAS[active]!;

  useEffect(() => {
    setReady(false);
    mintToken(persona.sub, persona.role, persona.label).then(() => setReady(true));
  }, [persona.sub, persona.role, persona.label]);

  // Density differs by persona; the tokens do not. docs/07 §6.
  const candidate = persona.role === 'CANDIDATE';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--axis-burgundy-600)', borderBottom: '3px solid var(--axis-gold-400)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 var(--space-5)' }}>
          <div className="row" style={{ justifyContent: 'space-between', height: 60, gap: 'var(--space-4)' }}>
            <Logo light />
            <nav className="row" style={{ gap: 4 }} aria-label="Persona">
              {PERSONAS.map((p, i) => (
                <button key={p.sub} onClick={() => setActive(i)}
                  aria-current={i === active ? 'page' : undefined}
                  style={{
                    font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: 'transparent', border: 0, color: '#fff',
                    padding: '0 14px', height: 60,
                    opacity: i === active ? 1 : 0.62,
                    borderBottom: `3px solid ${i === active ? 'var(--axis-gold-400)' : 'transparent'}`,
                    marginBottom: -3,
                  }}>
                  {p.label}
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 400, opacity: 0.85 }}>
                    {p.blurb}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main style={{
        flex: 1,
        maxWidth: candidate ? 900 : 1280,
        width: '100%', margin: '0 auto',
        padding: 'var(--space-6) var(--space-5)',
        fontSize: candidate ? 15 : 14,
      }}>
        {!ready ? (
          <p className="muted">Signing in as {persona.label}…</p>
        ) : persona.role === 'TA_ADMIN' ? <Admin />
          : persona.role === 'RECRUITER' ? <Recruiter />
          : <Candidate candidateId={persona.sub} />}
      </main>

      <footer style={{
        borderTop: '1px solid var(--axis-line)', background: '#fff',
        padding: 'var(--space-4) var(--space-5)', fontSize: 12,
      }}>
        <div className="muted" style={{ maxWidth: 1280, margin: '0 auto' }}>
          Axis Bank · ThriveHR AI Assessment Module — demo build. Persona switching is a development
          convenience; in production these identities come from ThriveHR SSO.
        </div>
      </footer>
    </div>
  );
};
