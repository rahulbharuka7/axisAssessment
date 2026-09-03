# 06 — Full API Surface

All endpoints under `/ai-assessment/api/v1`. Conventions follow the attached
`ASSESSMENT_ELIGIBILITY.md`: `GET` for reads, `POST` for every mutation including updates and
deletes (`/{id}/update`, `/{id}/delete`), soft deletes throughout, `{success, data}` /
`{success, error}` envelope.

**Auth:** Bearer JWT. Role claim determines access — `CANDIDATE`, `RECRUITER`, `TA_ADMIN`.

---

## 1. Candidate

| Method | Path | Purpose |
|---|---|---|
| POST | `/eligibility` | **Doc 05.** Am I required to take this? |
| GET | `/candidate/assessments` | My assessments and their statuses |
| POST | `/candidate/consent` | Record proctoring consent (version, timestamp) |
| POST | `/candidate/sessions/start` | Create or resume a session |
| GET | `/candidate/sessions/{id}` | Session state, current question, time remaining |
| POST | `/candidate/sessions/{id}/system-check` | Report device/bandwidth check results |
| POST | `/candidate/sessions/{id}/identity` | Upload face + ID images for verification |
| GET | `/candidate/sessions/{id}/questions/{qid}` | Fetch one question |
| POST | `/candidate/sessions/{id}/answers` | Save an answer (idempotent, autosave) |
| POST | `/candidate/sessions/{id}/answers/batch` | Flush buffered offline answers |
| POST | `/candidate/sessions/{id}/upload` | Image or audio answer asset |
| POST | `/candidate/sessions/{id}/heartbeat` | Liveness + server-authoritative timer sync |
| POST | `/candidate/sessions/{id}/proctor-events` | Batch real-time proctoring events |
| POST | `/candidate/sessions/{id}/media-chunk` | Chunked recording upload |
| POST | `/candidate/sessions/{id}/submit` | Submit (manual or auto on timeout) |
| GET | `/candidate/sessions/{id}/result` | Outcome, subject to the Admin visibility policy |

**Key contracts**

- `POST /answers` is **idempotent on `(session_id, question_id, client_revision)`**. Autosave
  retries after a dropped connection must never duplicate or clobber a newer answer. This is
  the endpoint that delivers doc 04's "never lose an answer" principle.
- `heartbeat` returns `time_remaining_seconds` from the server. The client clock is display
  only — never authoritative, or the timer is trivially manipulable.
- `submit` is idempotent; a double-submit returns the original submission.
- `answers/batch` accepts an offline buffer and resolves conflicts by `client_revision`,
  returning per-answer accepted/rejected status.

---

## 2. Recruiter

### 2.1 Tests

| Method | Path | Purpose |
|---|---|---|
| GET | `/recruiter/tests` | List; filter by status, role, window |
| POST | `/recruiter/tests` | Create from a published blueprint |
| GET | `/recruiter/tests/{id}` | Full configuration |
| POST | `/recruiter/tests/{id}/update` | Edit (locked fields rejected once live) |
| POST | `/recruiter/tests/{id}/sections/autofill` | Draw items per blueprint selection rules |
| POST | `/recruiter/tests/{id}/questions/import` | Excel blueprint upload → parsed preview |
| POST | `/recruiter/tests/{id}/questions/import/confirm` | Commit a previewed import |
| GET | `/recruiter/tests/{id}/preview` | Render exactly as a candidate sees it |
| POST | `/recruiter/tests/{id}/publish` | Go live, generate link |
| POST | `/recruiter/tests/{id}/pause` | Suspend new starts |
| POST | `/recruiter/tests/{id}/archive` | Archive |

### 2.2 Invitations

| Method | Path | Purpose |
|---|---|---|
| POST | `/recruiter/tests/{id}/invite` | Invite candidates (list or CSV) |
| GET | `/recruiter/tests/{id}/invites` | Delivery and start tracking |
| POST | `/recruiter/tests/{id}/invites/{iid}/resend` | Resend |
| POST | `/recruiter/tests/{id}/invites/{iid}/extend` | Extend this candidate's window |

Invite runs eligibility per candidate first and reports the breakdown
(ELIGIBLE / SKIP / PENDING_COOLING / NOT_APPLICABLE / NOT_ELIGIBLE) before sending — a
recruiter should know they are inviting 96 people, not 120, before the emails go out.

### 2.3 Review & decisioning

| Method | Path | Purpose |
|---|---|---|
| GET | `/recruiter/tests/{id}/candidates` | The dashboard list — sort/filter by score, risk, status |
| GET | `/recruiter/sessions/{id}/report` | Full candidate report |
| GET | `/recruiter/sessions/{id}/flags` | Flag timeline |
| GET | `/recruiter/sessions/{id}/flags/{fid}/clip` | Signed, short-lived clip URL |
| POST | `/recruiter/sessions/{id}/flags/{fid}/review` | `genuine` / `false_positive` + note |
| POST | `/recruiter/sessions/{id}/decision` | `shortlist` / `reject` / `hold` |
| POST | `/recruiter/sessions/{id}/rescore` | Re-run scoring after a manual correction |
| POST | `/recruiter/sessions/{id}/void` | Void a session with an audited reason |
| POST | `/recruiter/candidates/{cid}/grant-attempt` | Grant an extra attempt (doc 05 §7.2) |
| GET | `/recruiter/tests/{id}/export` | CSV / XLSX export |

Clip URLs are **signed and expire in 15 minutes**; every issuance is audited. Proctoring
footage is the most sensitive artefact in the system and must not sit behind a guessable or
shareable link.

### 2.4 Question bank

| Method | Path | Purpose |
|---|---|---|
| GET | `/recruiter/questions` | Browse; filter by competency, type, difficulty, status |
| POST | `/recruiter/questions` | Propose a new item (enters `draft`) |
| POST | `/recruiter/questions/{id}/update` | Edit an item not yet approved |
| POST | `/recruiter/questions/{id}/submit-for-review` | Send to Admin for approval |

A recruiter proposes; only `TA_ADMIN` approves (doc 02 §4).

---

## 3. Admin

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/requirements` | **Doc 05 §7** — list eligibility rules |
| POST | `/admin/requirements` | Add |
| POST | `/admin/requirements/{id}/update` | Edit |
| POST | `/admin/requirements/{id}/delete` | Soft delete |
| GET | `/admin/settings` | Global + per-role overrides |
| POST | `/admin/settings/update` | Update global policy |
| POST | `/admin/settings/{role_id}/update` | Upsert a role override |
| GET | `/admin/frameworks` | Competency frameworks |
| POST | `/admin/frameworks` | Create |
| POST | `/admin/frameworks/{id}/publish` | Publish (freezes the version) |
| GET | `/admin/competencies` | Tree read |
| POST | `/admin/competencies` | Add meta / competency / sub-competency |
| POST | `/admin/competencies/{id}/update` | Edit |
| POST | `/admin/competencies/{id}/delete` | Soft delete |
| GET | `/admin/blueprints` | List |
| POST | `/admin/blueprints/import` | Excel → parsed preview (doc 01 §6) |
| POST | `/admin/blueprints/import/confirm` | Commit as a draft version |
| POST | `/admin/blueprints/{id}/publish` | Publish |
| POST | `/admin/questions/{id}/approve` | Approve an item |
| POST | `/admin/questions/{id}/retire` | Retire an item |
| GET | `/admin/questions/statistics` | p-value / discrimination drift report |
| GET | `/admin/ai-thresholds` | Risk bands, weights, model pins |
| POST | `/admin/ai-thresholds/update` | Update |
| GET | `/admin/audit` | Filterable audit log |
| GET | `/admin/audit/export` | CSV / JSON export |
| GET | `/admin/consent-register` | Who consented, to what version, when |
| GET | `/admin/retention` | Due for purge, purged, failed |
| POST | `/admin/candidates/{cid}/erase` | Right-to-erasure + deletion certificate |

---

## 4. ATS Integration

The full contract between ThriveHR's ATS and this module.

| Direction | Mechanism | Payload |
|---|---|---|
| ATS → Module | `POST /eligibility` | `role_id`, `program_type` (+ candidate JWT) |
| ATS → Module | `POST /ats/sessions/link` | Associate an application with a session |
| Module → ATS | Webhook `assessment.completed` | session id, outcome, score, risk band |
| Module → ATS | Webhook `assessment.decided` | recruiter decision |
| Module → ATS | Webhook `assessment.voided` | session voided, reason |

**Invariant 6 restated:** the module never writes to ATS tables. Webhooks notify; the ATS
decides what to persist on the application record.

Webhooks are signed (HMAC-SHA256 over the raw body), carry an idempotency key, and retry
with exponential backoff for 24 hours. A consumer that has already applied an event must be
able to detect the replay — hence the key.

---

## 5. Cross-Cutting

| Concern | Standard |
|---|---|
| Envelope | `{success:true, data:{…}}` / `{success:false, error:{code,message,field,request_id}}` |
| Pagination | `?page=`, `?page_size=` (default 25, max 200); response carries `total`, `page`, `page_size` |
| Sorting | `?sort=field:asc\|desc` |
| Idempotency | `Idempotency-Key` header honoured on answer save, submit, invite and decision |
| Tracing | `X-Request-Id` accepted and echoed; propagated to logs and audit |
| Rate limits | Candidate 30/min · Recruiter 300/min · Service account 1000/min |
| Versioning | Path-versioned `/v1`; additive changes only within a version |
| Timestamps | RFC 3339, UTC, `Z` suffix |
| Caching | `Cache-Control: no-store` on eligibility, results and any signed media URL |
