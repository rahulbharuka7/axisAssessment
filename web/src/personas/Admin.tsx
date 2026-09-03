import { useEffect, useState } from 'react';
import { api, type Requirement, type Settings, type ProgramType } from '../lib/api';
import { Banner, Empty, StatCard } from '../components/ui';

const PROGRAMS: (ProgramType | 'ALL')[] = ['ALL', 'lateral', 'campus', 'referral', 'vendor', 'job_portal'];

export const Admin = () => {
  const [tab, setTab] = useState<'requirements' | 'policy' | 'audit'>('requirements');
  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <div>
        <h1 style={{ fontSize: 26 }}>Assessment Administration</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Set the rules everyone else operates inside — eligibility, policy and retention.
        </p>
      </div>
      <div className="row" style={{ gap: 2, borderBottom: '1px solid var(--axis-line)' }}>
        {(['requirements', 'policy', 'audit'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="btn btn-ghost"
            style={{
              minHeight: 40, borderRadius: 0, textTransform: 'capitalize',
              borderBottom: `2px solid ${tab === t ? 'var(--axis-burgundy-600)' : 'transparent'}`,
              color: tab === t ? 'var(--axis-burgundy-600)' : 'var(--axis-ink-500)',
            }}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'requirements' && <Requirements />}
      {tab === 'policy' && <Policy />}
      {tab === 'audit' && <Audit />}
    </div>
  );
};

const Requirements = () => {
  const [rows, setRows] = useState<Requirement[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ role_id: '', role_name: '', program_type: 'lateral', required: true });

  const load = () => api.get<Requirement[]>('/admin/requirements').then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const add = async () => {
    setErr(null);
    try {
      await api.post('/admin/requirements', {
        role_id: Number(form.role_id),
        role_name: form.role_name,
        program_type: form.program_type === 'ALL' ? null : form.program_type,
        required: form.required,
      });
      setForm({ role_id: '', role_name: '', program_type: 'lateral', required: true });
      load();
    } catch (e) { setErr((e as Error).message); }
  };

  const toggle = async (r: Requirement) => {
    await api.post(`/admin/requirements/${r.id}/update`, { required: r.required !== 1 });
    load();
  };

  const remove = async (r: Requirement) => {
    if (!confirm(`Delete the rule for ${r.role_name} / ${r.program_type ?? 'all programs'}?\n\nCandidates matching it will stop being assessed.`)) return;
    await api.post(`/admin/requirements/${r.id}/delete`);
    load();
  };

  const wildcards = rows.filter((r) => r.program_type === null).map((r) => r.role_id);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Banner tone="brand" title="Most specific wins">
        An exact <span className="mono">role + program</span> rule always beats an{' '}
        <span className="mono">All (*)</span> rule for the same role. A role with no rule at all
        defaults to <span className="mono">NOT_APPLICABLE</span> — candidates are waved through
        rather than blocked by a config gap.
      </Banner>

      {err && <Banner tone="danger" title="Could not save">{err}</Banner>}

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 150px 130px auto', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div><label className="label" htmlFor="rid">Role ID</label>
            <input id="rid" className="input" value={form.role_id} inputMode="numeric"
              onChange={(e) => setForm({ ...form, role_id: e.target.value })} /></div>
          <div><label className="label" htmlFor="rn">Role name</label>
            <input id="rn" className="input" value={form.role_name}
              onChange={(e) => setForm({ ...form, role_name: e.target.value })} /></div>
          <div><label className="label" htmlFor="pt">Program type</label>
            <select id="pt" className="select" value={form.program_type}
              onChange={(e) => setForm({ ...form, program_type: e.target.value })}>
              {PROGRAMS.map((p) => <option key={p} value={p}>{p === 'ALL' ? 'All (*)' : p}</option>)}
            </select></div>
          <div><label className="label" htmlFor="req">Assessment</label>
            <select id="req" className="select" value={String(form.required)}
              onChange={(e) => setForm({ ...form, required: e.target.value === 'true' })}>
              <option value="true">Required</option><option value="false">Not required</option>
            </select></div>
          <button className="btn btn-primary" onClick={add}
            disabled={!form.role_id || !form.role_name}>Add rule</button>
        </div>
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead><tr>
            <th>Role ID</th><th>Role name</th><th>Program type</th>
            <th>Assessment</th><th>Updated</th><th />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.role_id}</td>
                <td>{r.role_name}</td>
                <td>
                  {r.program_type === null
                    // Rendered as an explicit label — a blank cell reads as missing
                    // data, and this is the row most likely to be misread.
                    ? <span className="pill pill-brand">All (*)</span>
                    : <span className="mono">{r.program_type}</span>}
                  {r.program_type !== null && wildcards.includes(r.role_id) && (
                    <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>overrides All (*)</span>
                  )}
                </td>
                <td>
                  <button className={`pill ${r.required === 1 ? 'pill-low' : 'pill-neutral'}`}
                    onClick={() => toggle(r)} style={{ border: 0, cursor: 'pointer', font: 'inherit', fontWeight: 600 }}>
                    {r.required === 1 ? '● Required' : '○ Not required'}
                  </button>
                </td>
                <td className="muted mono" style={{ fontSize: 12 }}>{r.updated_at.slice(0, 10)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><Empty title="No rules configured">Every role defaults to not required.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Policy = () => {
  const [all, setAll] = useState<Settings[]>([]);
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState(false);

  const load = () => api.get<Settings[]>('/admin/settings').then((s) => { setAll(s); setDraft(s[0] ?? {}); });
  useEffect(() => { load(); }, []);

  const global = all.find((s) => s.role_id === null);
  if (!global) return <Empty title="Loading policy…" />;

  const set = (k: keyof Settings, v: unknown) => { setDraft({ ...draft, [k]: v }); setSaved(false); };

  const save = async () => {
    await api.post('/admin/settings/update', draft);
    setSaved(true);
    load();
  };

  const Num = ({ k, label, hint, unit }: { k: keyof Settings; label: string; hint?: string; unit: string }) => (
    <div>
      <label className="label" htmlFor={k}>{label}</label>
      <div className="row" style={{ gap: 8 }}>
        <input id={k} className="input" style={{ width: 96 }} inputMode="numeric"
          value={String(draft[k] ?? '')}
          onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))} />
        <span className="muted" style={{ fontSize: 13 }}>{unit}</span>
      </div>
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 4, maxWidth: '46ch' }}>{hint}</div>}
    </div>
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-4)', maxWidth: 760 }}>
      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 17, marginBottom: 'var(--space-4)' }}>Retake &amp; validity</h3>
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {/* Labelled by what they do, not by the shared internal term "cooling
              period" — the two values serve opposite purposes. */}
          <Num k="cooling_period_pass_days" label="Result validity after a pass" unit="days"
            hint="A pass inside this window is carried forward — the candidate is not re-tested." />
          <Num k="cooling_period_fail_days" label="Lockout after a fail" unit="days"
            hint="The candidate may not re-attempt until this expires." />
          <Num k="max_attempts" label="Maximum attempts per role" unit="attempts (blank = unlimited)" />
          <div>
            <label className="label" htmlFor="sp">Score that counts</label>
            <select id="sp" className="select" style={{ width: 200 }} value={draft.score_policy ?? 'best'}
              onChange={(e) => set('score_policy', e.target.value)}>
              <option value="best">Best</option><option value="latest">Latest</option><option value="average">Average</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 17, marginBottom: 'var(--space-4)' }}>Session</h3>
        <Num k="session_ttl_minutes" label="Session hard expiry" unit="minutes"
          hint="Abandoned sessions expire and stop blocking future eligibility." />
      </div>

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 17, marginBottom: 'var(--space-4)' }}>Data retention</h3>
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <Num k="recording_retention_days" label="Proctoring video &amp; audio" unit="days" />
          <Num k="id_image_retention_days" label="ID verification images" unit="days"
            hint="Face embeddings are biometric data under the DPDP Act and are purged on this schedule, not the video one." />
          <Num k="answer_retention_days" label="Answers &amp; scores" unit="days" />
          <div>
            <label className="label" htmlFor="rv">Result visibility to candidate</label>
            <select id="rv" className="select" style={{ width: 220 }} value={draft.result_visibility ?? 'basic'}
              onChange={(e) => set('result_visibility', e.target.value)}>
              <option value="none">Status only</option>
              <option value="basic">Pass / fail</option>
              <option value="detailed">Detailed section feedback</option>
            </select>
          </div>
        </div>
      </div>

      <Banner tone="warning" title="Retention is enforced by a nightly purge">
        Shortening a window purges already-eligible media on the next run.
      </Banner>

      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <button className="btn btn-primary" onClick={save}>Save policy</button>
        {saved && <span className="pill pill-low">✓ Saved — applies to the next evaluation</span>}
      </div>
    </div>
  );
};

interface AuditRow {
  id: string; actor_type: string; actor_id: string | null; action: string;
  entity_type: string | null; entity_id: string | null; after: string | null; created_at: string;
}

const Audit = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  useEffect(() => {
    api.get<AuditRow[]>('/admin/audit?page_size=60').then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Banner tone="brand" title="Every eligibility decision is recorded">
        “Why was this candidate skipped?” is a question compliance will eventually ask, and
        reconstructing it from settings that have since changed is otherwise impossible.
      </Banner>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.created_at.replace('T', ' ').slice(0, 19)}</td>
                <td><span className="pill pill-neutral">{r.actor_type}</span></td>
                <td className="mono" style={{ fontSize: 12 }}>{r.action}</td>
                <td className="muted mono" style={{ fontSize: 11.5 }}>{r.entity_type}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ''}</td>
                <td className="muted mono" style={{ fontSize: 11.5, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.after ?? ''}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}><Empty title="No audit entries yet" /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
