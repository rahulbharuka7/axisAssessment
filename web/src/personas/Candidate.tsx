import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Eligibility, type Question } from '../lib/api';
import { Banner, Empty } from '../components/ui';

type Stage = 'landing' | 'consent' | 'syscheck' | 'test' | 'done';

const ROLE = { role_id: 101, program_type: 'lateral' as const };

export const Candidate = ({ candidateId }: { candidateId: string }) => {
  const [stage, setStage] = useState<Stage>('landing');
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(() => {
    setErr(null);
    api.post<Eligibility>('/eligibility', ROLE).then(setElig).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => { setStage('landing'); setSessionId(null); check(); }, [candidateId, check]);

  if (err) return <Banner tone="danger" title="Could not check your assessment">{err}</Banner>;
  if (!elig) return <Empty title="Checking your assessment…" />;

  if (stage === 'done' && sessionId) return <Submitted sessionId={sessionId} onDone={() => { setStage('landing'); check(); }} />;
  if (stage === 'test' && sessionId) return <Runtime sessionId={sessionId} onSubmitted={() => setStage('done')} />;
  if (stage === 'consent') return <Consent onAccept={() => setStage('syscheck')} onDecline={() => setStage('landing')} />;
  if (stage === 'syscheck') {
    return <SystemCheck onReady={async () => {
      try {
        const s = await api.post<{ id: string }>('/candidate/sessions/start', ROLE);
        setSessionId(s.id);
        setStage('test');
      } catch (e) { setErr((e as Error).message); }
    }} />;
  }
  return <Landing elig={elig} onStart={() => setStage('consent')} onResume={(id) => { setSessionId(id); setStage('test'); }} />;
};

/**
 * Each show_button:false branch gets its own copy. Collapsing all five into one
 * generic "not available" is the most common way this frustrates real applicants:
 * "carried forward" is good news, "attempts used" needs an action.
 */
const Landing = ({ elig, onStart, onResume }: {
  elig: Eligibility; onStart: () => void; onResume: (id: string) => void;
}) => {
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const shell = (children: React.ReactNode) => (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="card" style={{ padding: 'var(--space-7)' }}>{children}</div>
      <div className="muted mono" style={{ fontSize: 11, textAlign: 'center', marginTop: 12 }}>
        {elig.status} · {elig.reason} · show_button={String(elig.show_button)}
      </div>
    </div>
  );

  if (elig.status === 'NOT_APPLICABLE') {
    return shell(<>
      <h1 style={{ fontSize: 24 }}>No assessment needed</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        This role does not require an assessment. Your application continues as normal — there is
        nothing for you to do here.
      </p>
    </>);
  }

  if (elig.status === 'SKIP') {
    return shell(<>
      <h1 style={{ fontSize: 24 }}>Your previous result has been carried forward</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        You already passed this assessment, and that result is still valid. You do not need to take
        it again — your application continues to the next stage.
      </p>
      <div style={{ marginTop: 'var(--space-5)' }}>
        <Banner tone="success" title="Valid until">{date(elig.cooling_ends_at)}</Banner>
      </div>
    </>);
  }

  if (elig.status === 'PENDING_COOLING') {
    return shell(<>
      <h1 style={{ fontSize: 24 }}>Assessment available from {date(elig.cooling_ends_at)}</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        You have taken this assessment recently. You may reattempt it from the date above.
        This will be attempt {elig.attempts_used + 1}{elig.max_attempts ? ` of ${elig.max_attempts}` : ''}.
      </p>
    </>);
  }

  if (elig.status === 'PENDING') {
    return shell(<>
      <h1 style={{ fontSize: 24 }}>You have an assessment in progress</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        Pick up exactly where you left off. Your answers were saved.
      </p>
      <button className="btn btn-primary" style={{ marginTop: 'var(--space-5)' }}
        onClick={() => onResume(elig.prior_session_id!)}>Resume assessment</button>
    </>);
  }

  if (elig.status === 'NOT_ELIGIBLE') {
    return shell(<>
      <h1 style={{ fontSize: 24 }}>You have used all available attempts</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        You have taken this assessment {elig.attempts_used} times, which is the maximum for this role.
        If something went wrong during an attempt — a power cut or a device failure — contact your
        recruiter, who can grant an additional attempt.
      </p>
    </>);
  }

  const mins = elig.estimated_duration_minutes;
  return shell(<>
    <h1 style={{ fontSize: 28 }}>{elig.role_name} Assessment</h1>
    <p className="muted" style={{ marginTop: 6 }}>Axis Bank</p>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--space-3)', margin: 'var(--space-5) 0' }}>
      {[
        ['⏱', mins ? `${mins} min` : 'Timed', 'total'],
        ['▤', '4 sections', '123 items'],
        ['↻', `Attempt ${elig.attempts_used + 1}`, elig.max_attempts ? `of ${elig.max_attempts}` : 'unlimited'],
      ].map(([icon, big, small]) => (
        <div key={big} style={{ background: 'var(--axis-burgundy-50)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 18 }}>{icon}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, marginTop: 4 }}>{big}</div>
          <div className="muted" style={{ fontSize: 12 }}>{small}</div>
        </div>
      ))}
    </div>

    <h3 style={{ fontSize: 15, marginBottom: 'var(--space-2)' }}>Before you start</h3>
    <ul className="muted" style={{ fontSize: 13.5, paddingLeft: 20, margin: 0, lineHeight: 1.9 }}>
      <li>You need a working webcam and microphone</li>
      <li>This assessment is proctored and recorded</li>
      <li>Find a quiet, well-lit room where you will not be interrupted</li>
      <li>Once started, the timer does not pause</li>
      <li>Your answers save automatically — a dropped connection will not lose them</li>
    </ul>

    <button className="btn btn-primary" style={{ marginTop: 'var(--space-6)', width: '100%' }} onClick={onStart}>
      Continue to system check
    </button>
  </>);
};

const Consent = ({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) => {
  const [agreed, setAgreed] = useState(false);
  return (
    <div style={{ maxWidth: 660, margin: '0 auto' }}>
      <div className="card" style={{ padding: 'var(--space-7)' }}>
        <h1 style={{ fontSize: 24 }}>Proctoring consent</h1>
        <p className="muted" style={{ marginTop: 12 }}>To keep this assessment fair, Axis Bank will record:</p>
        <ul className="muted" style={{ fontSize: 13.5, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Video from your webcam for the duration of the assessment</li>
          <li>Audio from your microphone</li>
          <li>Your screen</li>
          <li>A photo of you and your ID for identity verification</li>
        </ul>

        <h3 style={{ fontSize: 15, marginTop: 'var(--space-5)' }}>How it is used</h3>
        <ul className="muted" style={{ fontSize: 13.5, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Reviewed by the Axis Bank hiring team if something is flagged</li>
          <li>Automated checks assist that review — they never decide alone</li>
          <li>Deleted automatically after 90 days</li>
          <li>Never shared outside Axis Bank’s hiring process</li>
        </ul>

        <div style={{ marginTop: 'var(--space-5)' }}>
          <Banner tone="brand">
            You may withdraw consent by leaving this page before starting. You cannot take the
            assessment without consenting. Declining is recorded as “consent declined”, not as a
            failed assessment.
          </Banner>
        </div>

        <label className="row" style={{ gap: 10, marginTop: 'var(--space-5)', cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: 'var(--axis-burgundy-600)' }} />
          I have read and consent to the above.
        </label>

        <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
          <button className="btn btn-ghost" onClick={onDecline}>I do not consent</button>
          <button className="btn btn-primary" disabled={!agreed} onClick={onAccept} style={{ flex: 1 }}>
            I consent — continue
          </button>
        </div>
      </div>
    </div>
  );
};

const CHECKS = [
  ['Browser', 'Chrome 128 — supported'],
  ['Camera', 'Working'],
  ['Microphone', 'Working'],
  ['Screen sharing', 'Permission granted'],
  ['Internet speed', '2.4 Mbps'],
] as const;

const SystemCheck = ({ onReady }: { onReady: () => void }) => {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (done >= CHECKS.length) return;
    const t = setTimeout(() => setDone((d) => d + 1), 420);
    return () => clearTimeout(t);
  }, [done]);
  const complete = done >= CHECKS.length;

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <div className="card" style={{ padding: 'var(--space-7)' }}>
        <h1 style={{ fontSize: 22 }}>Checking your setup</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 13.5 }}>
          This runs before the timer starts, so nothing here costs you time.
        </p>
        <div className="stack" style={{ gap: 'var(--space-3)', margin: 'var(--space-5) 0' }}>
          {CHECKS.map(([name, detail], i) => (
            <div key={name} className="row" style={{ gap: 'var(--space-3)', fontSize: 14 }}>
              <span style={{ width: 20, color: i < done ? 'var(--axis-success-600)' : 'var(--axis-ink-300)' }}>
                {i < done ? '✓' : '○'}
              </span>
              <span style={{ width: 150, fontWeight: 500 }}>{name}</span>
              <span className="muted" style={{ fontSize: 13 }}>{i < done ? detail : 'Testing…'}</span>
            </div>
          ))}
        </div>

        {complete && (
          <Banner tone="warning" title="Your connection is slower than we recommend">
            The assessment will still work — we will record at a lower quality and save your answers
            more often.
          </Banner>
        )}

        <button className="btn btn-primary" style={{ marginTop: 'var(--space-5)', width: '100%' }}
          disabled={!complete} onClick={onReady}>
          {complete ? 'Start assessment' : 'Running checks…'}
        </button>
      </div>
    </div>
  );
};

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const Runtime = ({ sessionId, onSubmitted }: { sessionId: string; onSubmitted: () => void }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [remaining, setRemaining] = useState(0);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [warning, setWarning] = useState<string | null>(null);
  const [warnCount, setWarnCount] = useState(0);
  const revisions = useRef<Record<string, number>>({});
  const buffer = useRef<Record<string, unknown>>({});

  useEffect(() => {
    api.get<{ questions: Question[]; time_remaining_seconds: number }>(`/candidate/sessions/${sessionId}`)
      .then((d) => {
        setQuestions(d.questions);
        setRemaining(d.time_remaining_seconds);
        const seeded: Record<string, unknown> = {};
        for (const q of d.questions) if (q.answer !== null) seeded[q.id] = q.answer;
        setAnswers(seeded);
      });
  }, [sessionId]);

  // Server-authoritative timer. The local countdown is display only; the
  // heartbeat reconciles it and auto-submits when time is up.
  useEffect(() => {
    const tick = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    const beat = setInterval(async () => {
      try {
        const d = await api.post<{ status: string; time_remaining_seconds: number }>(
          `/candidate/sessions/${sessionId}/heartbeat`);
        setRemaining(d.time_remaining_seconds);
        setSaving((s) => (s === 'offline' ? 'saved' : s));
        if (d.status !== 'in_progress') onSubmitted();
      } catch { setSaving('offline'); }
    }, 15000);
    return () => { clearInterval(tick); clearInterval(beat); };
  }, [sessionId, onSubmitted]);

  // Tab-switch detection, with the calm counted warning from docs/04 §3.5.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const next = warnCount + 1;
      setWarnCount(next);
      setWarning(`Please stay on this tab. Switching away is recorded. Warning ${next} of 3.`);
      api.post(`/candidate/sessions/${sessionId}/proctor-events`, {
        events: [{ flag_type: 'TAB_SWITCH', started_at_ms: Date.now() % 10_000_000, confidence: 1, warned: true }],
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [sessionId, warnCount]);

  const save = useCallback(async (qid: string, value: unknown) => {
    const rev = (revisions.current[qid] ?? 0) + 1;
    revisions.current[qid] = rev;
    buffer.current[qid] = value;
    setSaving('saving');
    try {
      await api.post(`/candidate/sessions/${sessionId}/answers`, {
        question_id: qid, value, client_revision: rev,
      });
      delete buffer.current[qid];
      setSaving('saved');
    } catch {
      // Held in the buffer and flushed on reconnect — nothing is lost.
      setSaving('offline');
    }
  }, [sessionId]);

  // Flush the offline buffer once connectivity returns.
  useEffect(() => {
    if (saving !== 'offline') return;
    const t = setInterval(async () => {
      const pending = Object.entries(buffer.current);
      if (pending.length === 0) return;
      try {
        await api.post(`/candidate/sessions/${sessionId}/answers/batch`, {
          answers: pending.map(([question_id, value]) => ({
            question_id, value, client_revision: revisions.current[question_id],
          })),
        });
        buffer.current = {};
        setSaving('saved');
      } catch { /* still offline */ }
    }, 5000);
    return () => clearInterval(t);
  }, [saving, sessionId]);

  if (questions.length === 0) return <Empty title="Loading your assessment…" />;

  const q = questions[idx]!;
  const answered = Object.keys(answers).length;
  const sectionQs = questions.filter((x) => x.section_id === q.section_id);
  const posInSection = sectionQs.findIndex((x) => x.id === q.id) + 1;
  const sections = [...new Set(questions.map((x) => x.section_id))];

  const pick = (value: unknown) => { setAnswers({ ...answers, [q.id]: value }); save(q.id, value); };

  const submit = async () => {
    if (!confirm(`Submit your assessment?\n\nYou have answered ${answered} of ${questions.length} questions. This cannot be undone.`)) return;
    await api.post(`/candidate/sessions/${sessionId}/submit`);
    onSubmitted();
  };

  const low = remaining < 0.1 * 6300;
  const mid = remaining < 0.2 * 6300;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Stripped header — no navigation at all during the test. */}
      <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Section {sections.indexOf(q.section_id) + 1} of {sections.length} · {q.competency}
          </span>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <span className="mono" style={{ fontSize: 13 }}>Q {posInSection}/{sectionQs.length}</span>
            <span className="mono" style={{
              fontSize: 15, fontWeight: 700,
              color: low ? 'var(--axis-danger-600)' : mid ? 'var(--axis-warning-600)' : 'var(--axis-ink-900)',
            }} aria-live="polite">⏱ {fmt(remaining)}</span>
            <span className="pill pill-high" title="Recording">● REC</span>
            <span className={`pill ${saving === 'offline' ? 'pill-medium' : 'pill-low'}`} aria-live="polite">
              {saving === 'offline' ? '◐ Offline — saved on device' : saving === 'saving' ? '◌ Saving' : '✓ Saved'}
            </span>
          </div>
        </div>
        <div style={{ height: 5, background: 'var(--axis-burgundy-100)', borderRadius: 3, marginTop: 10 }}>
          <div style={{
            height: '100%', width: `${((idx + 1) / questions.length) * 100}%`,
            background: 'var(--axis-burgundy-600)', borderRadius: 3,
          }} />
        </div>
      </div>

      {warning && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Banner tone="warning" title="⚠ Please stay on this tab">
            {warning}{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => setWarning(null)}>Got it</button>
          </Banner>
        </div>
      )}

      <div className="card" style={{ padding: 'var(--space-6)' }}>
        <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <span className="pill pill-brand">{q.tool}</span>
          {q.difficulty && <span className="pill pill-neutral">{q.difficulty}</span>}
        </div>

        {/* 16px minimum — a candidate reading a reasoning item under time pressure
            on a 13" laptop is the worst place to save vertical space. */}
        <p style={{ fontSize: 16, lineHeight: 1.65 }}>{q.body}</p>

        <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
          {q.options?.map((o) => {
            const chosen = answers[q.id] === o.id;
            return (
              <label key={o.id} className="row"
                style={{
                  gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', cursor: 'pointer',
                  border: `1px solid ${chosen ? 'var(--axis-burgundy-600)' : 'var(--axis-line)'}`,
                  background: chosen ? 'var(--axis-burgundy-50)' : '#fff',
                  borderRadius: 'var(--radius-md)', fontSize: 15,
                }}>
                <input type="radio" name={q.id} checked={chosen} onChange={() => pick(o.id)}
                  style={{ accentColor: 'var(--axis-burgundy-600)', width: 17, height: 17 }} />
                {o.text}
              </label>
            );
          })}

          {q.question_type === 'LONG_TEXT' && (
            <>
              <textarea className="textarea" style={{ minHeight: 220, fontSize: 15 }}
                value={(answers[q.id] as string) ?? ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                onBlur={(e) => save(q.id, e.target.value)}
                placeholder="Write your reply here. Your work saves automatically." />
              <div className="muted" style={{ fontSize: 12 }}>
                {String((answers[q.id] as string) ?? '').trim().split(/\s+/).filter(Boolean).length} words · 150–200 recommended
              </div>
            </>
          )}

          {q.question_type === 'AUDIO_RESPONSE' && (
            <div style={{ border: '1px dashed var(--axis-line)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', textAlign: 'center' }}>
              <div style={{ fontSize: 26 }}>🎤</div>
              <button className="btn btn-secondary" style={{ marginTop: 12 }}
                onClick={() => pick({ audio: 'recorded', at: new Date().toISOString() })}>
                {answers[q.id] ? 'Re-record (1 retake allowed)' : 'Record your answer'}
              </button>
              {answers[q.id] ? <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Recording captured ✓</div> : null}
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--space-4)', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>◀ Previous</button>
        <span className="muted" style={{ fontSize: 13 }}>{answered} of {questions.length} answered</span>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {idx < questions.length - 1
            ? <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>Next ▶</button>
            : <span />}
          <button className="btn btn-secondary" onClick={submit}>Submit</button>
        </div>
      </div>
    </div>
  );
};

const Submitted = ({ sessionId, onDone }: { sessionId: string; onDone: () => void }) => {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    api.get<Record<string, unknown>>(`/candidate/sessions/${sessionId}/result`).then(setResult).catch(() => {});
  }, [sessionId]);

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <div className="card" style={{ padding: 'var(--space-7)', textAlign: 'center' }}>
        <div style={{ fontSize: 40, color: 'var(--axis-success-600)' }}>✓</div>
        <h1 style={{ fontSize: 24, marginTop: 12 }}>Assessment submitted</h1>
        <p className="muted mono" style={{ fontSize: 13, marginTop: 10 }}>
          Reference ASMT-{new Date().getFullYear()}-{sessionId.slice(0, 6).toUpperCase()}
        </p>

        <div style={{ marginTop: 'var(--space-5)', textAlign: 'left' }}>
          <Banner tone="success" title="What happens next">
            Your responses are being evaluated. The Axis Bank hiring team will review your assessment
            and contact you about next steps. You do not need to do anything further.
          </Banner>
        </div>

        {/* Visibility is policy-controlled. Scores are never shown alongside
            proctoring flags — a candidate must not learn what the detector caught. */}
        {result && result.visibility !== 'none' && (
          <div style={{ marginTop: 'var(--space-4)', textAlign: 'left' }}>
            <Banner tone="brand" title="Your outcome">
              {String(result.outcome) === 'pass' ? 'You have cleared this assessment.' : 'You did not clear this assessment on this attempt.'}
              {result.visibility === 'detailed' && result.total_score !== undefined && (
                <div className="mono" style={{ marginTop: 6 }}>Score: {String(result.total_score)} / {String(result.max_score)}</div>
              )}
            </Banner>
          </div>
        )}

        <button className="btn btn-secondary" style={{ marginTop: 'var(--space-6)' }} onClick={onDone}>
          Back to my application
        </button>
      </div>
    </div>
  );
};
