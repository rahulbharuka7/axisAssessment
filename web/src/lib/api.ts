const BASE = '/ai-assessment/api/v1';

export type Role = 'CANDIDATE' | 'RECRUITER' | 'TA_ADMIN';

export interface ApiError {
  code: string;
  message: string;
  field?: string;
  request_id?: string;
}

export class ApiFailure extends Error {
  constructor(public status: number, public error: ApiError) {
    super(error.message);
  }
}

let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new ApiFailure(res.status, body.error ?? { code: 'UNKNOWN', message: res.statusText });
  }
  return body.data as T;
};

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
};

/** Dev-only persona switch. In production these come from ThriveHR SSO. */
export const mintToken = async (sub: string, role: Role, name?: string) => {
  const d = await api.post<{ token: string }>('/dev/token', { sub, role, name });
  setToken(d.token);
  return d.token;
};

// ── shared types ────────────────────────────────────────────────────────────

export type ProgramType = 'lateral' | 'campus' | 'referral' | 'vendor' | 'job_portal';

export interface Eligibility {
  role_id: number;
  role_name: string | null;
  program_type: ProgramType;
  status: 'NOT_APPLICABLE' | 'SKIP' | 'PENDING_COOLING' | 'PENDING' | 'NOT_ELIGIBLE' | 'ELIGIBLE';
  reason: string;
  show_button: boolean;
  prior_session_id: string | null;
  cooling_ends_at: string | null;
  attempts_used: number;
  max_attempts: number | null;
  blueprint_id: string | null;
  estimated_duration_minutes: number | null;
  evaluated_at: string;
}

export interface Requirement {
  id: string;
  role_id: number;
  role_name: string;
  program_type: ProgramType | null;
  required: number;
  updated_at: string;
}

export interface Settings {
  role_id: number | null;
  cooling_period_pass_days: number;
  cooling_period_fail_days: number;
  max_attempts: number | null;
  score_policy: string;
  session_ttl_minutes: number;
  recording_retention_days: number;
  id_image_retention_days: number;
  answer_retention_days: number;
  result_visibility: string;
}

export interface Question {
  id: string;
  question_type: string;
  difficulty: string | null;
  body: string;
  options: { id: string; text: string }[] | null;
  competency: string;
  tool: string;
  section_id: string;
  answer: unknown;
  client_revision: number | null;
  marked_review: boolean;
}

export interface SectionScore {
  section_id: string;
  competency: string;
  tool: string;
  score: number;
  max: number;
  cutoff: number | null;
  passed: boolean | null;
}

export interface CandidateRow {
  id: string;
  candidate_id: string;
  status: string;
  outcome: string | null;
  total_score: number | null;
  max_score: number | null;
  risk_score: number | null;
  risk_band: 'low' | 'medium' | 'high' | null;
  attempt_number: number;
  flag_count: number;
  section_scores: SectionScore[];
}

export interface ProctorFlag {
  id: string;
  flag_type: string;
  started_at_ms: number;
  duration_ms: number | null;
  confidence: number | null;
  detected_by: string;
  model_version: string;
  review_verdict: string | null;
  review_note: string | null;
  warned: boolean;
}
