import { useEffect, useState } from 'react';
import { api, type CandidateRow, type ProctorFlag, type SectionScore } from '../lib/api';
import { Banner, Empty, OutcomePill, RiskPill, SectionBar, StatCard } from '../components/ui';

interface Test {
  id: string; name: string; status: string; role_id: number; program_type: string;
  closes_at: string | null; blueprint_name: string;
  invited: number; completed: number; flagged: number;
  proctoring: { enabled: boolean; warning_limit: number; on_limit: string; checks: Record<string, boolean> };
}

export const Recruiter = () => {
  const [tests, setTests] = useState<Test[]>([]);
  const [open, setOpen] = useState<Test | null>(null);
  const [session, setSession] = useState<string | null>(null);

  useEffect(() => { api.get<Test[]>('/recruiter/tests').then(setTests).catch(() => setTests([])); }, []);

  if (session) return <Report sessionId={session} onBack={() => setSession(null)} />;
  if (open) return <CandidateList test={open} onBack={() => setOpen(null)} onOpen={setSession} />;

  const totals = tests.reduce(
    (a, t) => ({ invited: a.invited + t.invited, completed: a.completed + t.completed, flagged: a.flagged + t.flagged }),
    { invited: 0, completed: 0, flagged: 0 },
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Assessments</h1>
          <p className="muted" style={{ marginTop: 4 }}>Build the test, invite the people, read the signal, make the call.</p>
        </div>
        <button className="btn btn-primary">+ Create Test</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 'var(--space-4)' }}>
        <StatCard label="Invited" value={totals.invited} />
        <StatCard label="Completed" value={totals.completed} />
        <StatCard label="Awaiting review" value={Math.max(0, totals.completed - totals.flagged)} />
        <StatCard label="Flagged" value={totals.flagged} hint="Medium or high risk" />
      </div>

      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--axis-ink-500)' }}>
          Active tests
        </h2>
        {tests.map((t) => (
          <div key={t.id} className="card card-active"
            style={{ padding: 'var(--space-4) var(--space-5)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-4)', alignItems: 'center' }}>
            <div>
              <div className="row" style={{ gap: 'var(--space-3)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>{t.name}</span>
                <span className={`pill ${t.status === 'live' ? 'pill-low' : 'pill-neutral'}`}>
                  {t.status === 'live' ? '● Live' : `◇ ${t.status}`}
                </span>
                {t.proctoring.enabled && <span className="pill pill-brand">Proctored</span>}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {t.blueprint_name} · {t.invited} invited · {t.completed} completed · {t.flagged} flagged
                {t.closes_at && ` · closes ${t.closes_at.slice(0, 10)}`}
              </div>
            </div>
            <button className="btn btn-secondary" onClick={() => setOpen(t)}>Open</button>
          </div>
        ))}
        {tests.length === 0 && <Empty title="No tests yet">Create a test from a published blueprint to get started.</Empty>}
      </div>
    </div>
  );
};

const CandidateList = ({ test, onBack, onOpen }: { test: Test; onBack: () => void; onOpen: (id: string) => void }) => {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [risk, setRisk] = useState('');

  useEffect(() => {
    api.get<CandidateRow[]>(`/recruiter/tests/${test.id}/candidates${risk ? `?risk=${risk}` : ''}`)
      .then(setRows).catch(() => setRows([]));
  }, [test.id, risk]);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ alignSelf: 'flex-start' }}>← All tests</button>
      <div>
        <h1 style={{ fontSize: 24 }}>{test.name}</h1>
        <p className="muted" style={{ marginTop: 4 }}>{rows.length} candidates · sorted by risk, then score</p>
      </div>

      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <select className="select" style={{ width: 180 }} value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="">All risk levels</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="low">Low risk</option>
        </select>
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead><tr>
            <th>Candidate</th><th>Status</th><th className="num">Score</th>
            <th>Outcome</th><th>Risk</th><th className="num">Flags</th><th className="num">Attempt</th><th />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.candidate_id}</td>
                <td><span className="pill pill-neutral">{r.status.replace('_', ' ')}</span></td>
                <td className="num">{r.total_score === null ? '—' : `${r.total_score}/${r.max_score}`}</td>
                <td><OutcomePill outcome={r.outcome} /></td>
                <td><RiskPill band={r.risk_band} /></td>
                <td className="num">{r.flag_count}</td>
                <td className="num">{r.attempt_number}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => onOpen(r.id)}>Review</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}><Empty title="No candidates match">Adjust the risk filter, or invite candidates to this test.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const FLAG_LABEL: Record<string, string> = {
  FACE_ABSENT: 'Face not visible', MULTI_FACE: 'Second person detected',
  FACE_MISMATCH: 'Face did not match ID', TAB_SWITCH: 'Switched tab or window',
  COPY_PASTE: 'Copy-paste attempt', FULLSCREEN_EXIT: 'Left full screen',
  SECOND_DEVICE: 'Second device detected', EXTRA_VOICE: 'Additional voice heard',
  TIMING_ANOMALY: 'Unusual answer timing',
};

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const Report = ({ sessionId, onBack }: { sessionId: string; onBack: () => void }) => {
  const [data, setData] = useState<{
    session: CandidateRow & { section_scores: SectionScore[]; started_at: string | null };
    flags: ProctorFlag[];
  } | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = () => api.get<typeof data>(`/recruiter/sessions/${sessionId}/report`).then(setData);
  useEffect(() => { load(); }, [sessionId]);

  if (!data) return <Empty title="Loading report…" />;
  const { session, flags } = data;
  const span = Math.max(...flags.map((f) => f.started_at_ms + (f.duration_ms ?? 0)), 1);

  const review = async (f: ProctorFlag, verdict: 'genuine' | 'false_positive') => {
    const text = note[f.id]?.trim();
    if (!text) { alert('A note is required so the label can be audited.'); return; }
    await api.post(`/recruiter/sessions/${sessionId}/flags/${f.id}/review`, { verdict, note: text });
    load();
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ alignSelf: 'flex-start' }}>← Back</button>

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <h1 style={{ fontSize: 22 }}>{session.candidate_id}</h1>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Attempt {session.attempt_number} · session <span className="mono">{sessionId.slice(0, 8)}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700 }}>
              {session.total_score === null ? '—' : `${session.total_score}/${session.max_score}`}
            </div>
            <OutcomePill outcome={session.outcome} />
            <RiskPill band={session.risk_band} />
            <span className="pill pill-neutral">{flags.length} flags</span>
          </div>
        </div>

        <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-primary btn-sm">Shortlist</button>
          <button className="btn btn-secondary btn-sm">Hold</button>
          <button className="btn btn-danger btn-sm">Reject</button>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 'var(--space-4)' }}>Section breakdown</h3>
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          {session.section_scores.map((s) => <SectionBar key={s.section_id} s={s} />)}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 'var(--space-4)' }}>
          The vertical mark is the blueprint cutoff. Sections showing “AI scoring” are queued for
          rubric, speech or norm-referenced scoring and are excluded from the objective total.
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 'var(--space-4)' }}>Proctoring timeline</h3>
        {flags.length === 0 ? (
          <Banner tone="success" title="No flags raised">Nothing to review on this session.</Banner>
        ) : (
          <>
            <div style={{ position: 'relative', height: 34, background: 'var(--axis-surface-alt)', borderRadius: 4, marginBottom: 'var(--space-4)' }}>
              {flags.map((f) => (
                <div key={f.id} title={`${FLAG_LABEL[f.flag_type] ?? f.flag_type} at ${clock(f.started_at_ms)}`}
                  style={{
                    position: 'absolute', top: 6, bottom: 6,
                    left: `${(f.started_at_ms / span) * 96}%`, width: 4, borderRadius: 2,
                    background: f.review_verdict === 'false_positive' ? 'var(--axis-ink-300)' : 'var(--axis-danger-600)',
                  }} />
              ))}
            </div>
            <div className="stack" style={{ gap: 'var(--space-3)' }}>
              {flags.map((f) => (
                <div key={f.id} style={{ border: '1px solid var(--axis-line)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
                  <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <span className="mono" style={{ fontSize: 12.5, color: 'var(--axis-burgundy-600)', fontWeight: 600 }}>
                      ▶ {clock(f.started_at_ms)}
                    </span>
                    <strong style={{ fontSize: 14 }}>{FLAG_LABEL[f.flag_type] ?? f.flag_type}</strong>
                    {f.duration_ms && <span className="muted" style={{ fontSize: 12.5 }}>{Math.round(f.duration_ms / 1000)}s</span>}
                    <span className="muted mono" style={{ fontSize: 12 }}>confidence {f.confidence?.toFixed(2)}</span>
                    <span className="pill pill-neutral">{f.detected_by}</span>
                    {f.review_verdict && (
                      <span className={`pill ${f.review_verdict === 'genuine' ? 'pill-high' : 'pill-low'}`}>
                        {f.review_verdict === 'genuine' ? '✓ Genuine' : '✗ False positive'}
                      </span>
                    )}
                  </div>
                  {f.review_note && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>“{f.review_note}”</div>}
                  {!f.review_verdict && (
                    <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                      <input className="input" placeholder="Reason for your verdict (required, audited)"
                        value={note[f.id] ?? ''} onChange={(e) => setNote({ ...note, [f.id]: e.target.value })} />
                      <button className="btn btn-secondary btn-sm" onClick={() => review(f, 'genuine')}>Genuine</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => review(f, 'false_positive')}>False positive</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Banner tone="brand" title="AI output is advisory">
            A high risk band orders the review queue. It never blocks a result — a recruiter always
            decides. Labelled false positives feed the evaluation set used to tune the detector.
          </Banner>
        </div>
      </div>
    </div>
  );
};
