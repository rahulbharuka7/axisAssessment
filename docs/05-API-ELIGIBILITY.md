# 05 — Assessment Eligibility API
## Axis Bank / ThriveHR — implementation-ready specification

> **Provenance.** This document is generated from the attached `ASSESSMENT_ELIGIBILITY.md`.
> It preserves that file's contract exactly — endpoint paths, `tmext_*` table names, status
> and reason vocabulary, the `show_button` convention, and all six invariants. It extends it
> with the retake rules from `AI_Assessment_Module_Plan.txt` §6B, resolves four
> under-specified cases, and adds the error, security and observability surface needed to
> build it.
>
> **Every change to the original contract is listed in §12.** Nothing is changed silently.

---

## 1. Purpose

A single API that the ATS calls when a candidate reaches **Shortlisted**, to decide whether
to show the "Start Assessment" button or skip the assessment entirely.

The assessment module owns the eligibility logic. The ATS acts on the response.

---

## 2. Requirements Config Table

TA-Admin maintains this table. It defines whether an assessment is required for a given
role + program type combination.

```
tmext_ai_assessment_requirements

id     | role_id | role_name          | program_type | required
-------|---------|--------------------|--------------|----------
uuid   | 101     | Retail Officer     | lateral      | true
uuid   | 101     | Retail Officer     | campus       | false
uuid   | 102     | Branch Manager     | lateral      | true
uuid   | 103     | Campus Graduate    | campus       | false
uuid   | 104     | Sales Officer      | NULL         | true      ← wildcard
```

- `role_id` — integer, matches role ID from `tmext_job`
- `role_name` — display name, denormalised for readability
- `program_type` — `lateral` / `campus` / `referral` / `vendor` / `job_portal`
- `required` — true / false
- `NULL` `program_type` = applies to all program types (wildcard)

### 2.1 Wildcard precedence — **RESOLVED**

The original spec defines a wildcard but not what happens when both an exact row and a
wildcard row match. Ambiguity here is a live production bug.

**Rule: most specific wins.**

```
1. Look for a row where role_id = ? AND program_type = ?   (exact)
2. If none, look for role_id = ? AND program_type IS NULL  (wildcard)
3. If none, NOT_APPLICABLE  (fail safe — invariant 3)
```

Enforced in the schema so it cannot be violated by data entry:

```sql
-- at most one live exact row per (role, program)
CREATE UNIQUE INDEX uq_req_exact
  ON tmext_ai_assessment_requirements (role_id, program_type)
  WHERE is_deleted = false AND program_type IS NOT NULL;

-- at most one live wildcard row per role
CREATE UNIQUE INDEX uq_req_wildcard
  ON tmext_ai_assessment_requirements (role_id)
  WHERE is_deleted = false AND program_type IS NULL;
```

---

## 3. Eligibility API

### 3.1 Request

```http
POST /ai-assessment/api/v1/eligibility
Authorization: Bearer <candidate JWT>
Content-Type: application/json
X-Request-Id: <uuid>            # optional; echoed back for tracing

{
  "role_id": 101,
  "program_type": "lateral"
}
```

`candidate_id` comes from the JWT — never from the request body. *(Invariant 1)*

| Field | Type | Required | Validation |
|---|---|---|---|
| `role_id` | integer | yes | > 0, must exist in `tmext_job` |
| `program_type` | string | yes | one of the five enum values |

### 3.2 Internal Logic

```
Step 0 — Resolve config
         Load cooling + attempt settings from tmext_ai_assessment_settings
         (role-scoped row if present, else global row)

Step 1 — Check requirements table
         Resolve role_id + program_type by §2.1 precedence
         No row found, or required = false
         → NOT_APPLICABLE / ROLE_NOT_REQUIRED, stop

Step 2 — Check for an ACTIVE session          ◀── moved ahead of history (§12.1)
         Any session for candidate_id + role_id with
         status IN (in_progress, submitted, scoring)
           · not past its hard expiry
         → PENDING / ATTEMPT_IN_PROGRESS, stop

         Session in_progress but past hard expiry
         → mark it expired, continue to Step 3

Step 3 — Check session history
         Any prior SCORED session for candidate_id + role_id?
         No → ELIGIBLE / NO_PRIOR_RECORD, stop

Step 4 — Check attempt budget                 ◀── new, from attachment 1 §6B (§12.2)
         attempts_used >= max_attempts?
         → NOT_ELIGIBLE / MAX_ATTEMPTS_EXHAUSTED, stop

Step 5 — Check outcome + cooling period
         Evaluated against the MOST RECENT scored session.

         Passed + within cooling window  → SKIP            / PRIOR_PASS_IN_COOLING
         Passed + cooling expired        → ELIGIBLE        / PRIOR_PASS_COOLING_EXPIRED
         Failed + within cooling window  → PENDING_COOLING / PRIOR_FAIL_IN_COOLING
         Failed + cooling expired        → ELIGIBLE        / PRIOR_FAIL_COOLING_EXPIRED
```

**Cooling window arithmetic**

```
cooling_ends_at = last_scored_session.scored_at + cooling_period(outcome)
in_cooling      = now() < cooling_ends_at
```

`cooling_period` is config-driven — no hardcoded value *(Invariant 4)*. Pass and fail
cooling periods are configured separately (§12.3); they serve opposite purposes:

- **Pass cooling** = *"this result is still valid, carry it forward"* — typically long
  (e.g. 180 days). The candidate is spared a re-test.
- **Fail cooling** = *"you may not retry yet"* — typically short (e.g. 90 days). This is
  a lockout.

### 3.3 Response

```json
{
  "success": true,
  "data": {
    "role_id": 101,
    "role_name": "Retail Officer",
    "program_type": "lateral",
    "status": "ELIGIBLE",
    "reason": "NO_PRIOR_RECORD",
    "show_button": true,
    "prior_session_id": null,
    "cooling_ends_at": null,
    "attempts_used": 0,
    "max_attempts": 2,
    "blueprint_id": "e6c1...",
    "estimated_duration_minutes": 105,
    "evaluated_at": "2026-09-03T11:04:22Z"
  }
}
```

`show_button` is the single field the frontend reads to show or hide the CTA.
*(Invariant 5)*

| Field | Type | Notes |
|---|---|---|
| `status` | enum | see §4 |
| `reason` | enum | see §4 |
| `show_button` | boolean | **the only field the frontend branches on** |
| `prior_session_id` | uuid \| null | the session driving the decision |
| `cooling_ends_at` | timestamptz \| null | set for `SKIP` and `PENDING_COOLING` |
| `attempts_used` | int | scored sessions to date, this role |
| `max_attempts` | int \| null | null = unlimited |
| `blueprint_id` | uuid \| null | which test they will take; null unless `show_button` |
| `estimated_duration_minutes` | int \| null | for the candidate-facing pre-test screen |
| `evaluated_at` | timestamptz | decision timestamp, for audit |

Additive fields only — no existing field changes type or meaning, so current ATS consumers
keep working untouched.

---

## 4. All Statuses

| status | reason | show_button | Meaning | ATS action |
|---|---|---|---|---|
| `NOT_APPLICABLE` | `ROLE_NOT_REQUIRED` | false | Role + program type not in requirements table, or marked false | `assessment_status = not_applicable` |
| `SKIP` | `PRIOR_PASS_IN_COOLING` | false | Passed before, cooling still active — carry forward | `carried_forward` + link prior session |
| `PENDING_COOLING` | `PRIOR_FAIL_IN_COOLING` | false | Failed before, cooling still active | `cooling` + show date |
| `PENDING` | `ATTEMPT_IN_PROGRESS` | false | Active session exists right now | do nothing |
| `NOT_ELIGIBLE` | `MAX_ATTEMPTS_EXHAUSTED` | false | **New** — attempt budget spent | `blocked` + route to recruiter |
| `ELIGIBLE` | `NO_PRIOR_RECORD` | true | Never taken this assessment | `pending` |
| `ELIGIBLE` | `PRIOR_FAIL_COOLING_EXPIRED` | true | Failed before, cooling expired | `pending` |
| `ELIGIBLE` | `PRIOR_PASS_COOLING_EXPIRED` | true | Passed before, cooling expired — fresh attempt needed | `pending` |

---

## 5. What ATS Does With the Response

| show_button | status | ATS action |
|---|---|---|
| `true` | `ELIGIBLE` | Surface "Start Assessment" CTA. Store `assessment_status = pending`. |
| `false` | `SKIP` | Store `assessment_status = carried_forward`, link `assessment_session_id` to the prior session. Pipeline continues. |
| `false` | `NOT_APPLICABLE` | Store `assessment_status = not_applicable`. Pipeline continues. |
| `false` | `PENDING_COOLING` | Store `assessment_status = cooling`. Surface "Assessment available from {cooling_ends_at}". |
| `false` | `PENDING` | Do nothing — session already in progress. |
| `false` | `NOT_ELIGIBLE` | Store `assessment_status = blocked`. Surface to recruiter for a manual attempt grant. |

The assessment module does not write to ATS. *(Invariant 6)*

---

## 6. Tables

| Table | Purpose |
|---|---|
| `tmext_ai_assessment_requirements` | role_id + role_name + program_type → required true/false |
| `tmext_ai_assessment_sessions` | history lookup — candidate_id + role_id + outcome + scored_at |
| `tmext_ai_assessment_settings` | cooling periods, attempt limits, score policy |

### 6.1 `tmext_ai_assessment_requirements`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `role_id` | INTEGER | FK reference to role |
| `role_name` | TEXT | Denormalised display name |
| `program_type` | TEXT | nullable — NULL = all program types |
| `required` | BOOLEAN | |
| `created_by` | UUID | |
| `is_deleted` | BOOLEAN | soft delete |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### 6.2 `tmext_ai_assessment_sessions` — fields the eligibility path reads

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `candidate_id` | UUID | from JWT at session creation |
| `role_id` | INTEGER | |
| `program_type` | TEXT | |
| `blueprint_id` | UUID | which recipe was served |
| `status` | TEXT | `not_started` `in_progress` `submitted` `scoring` `scored` `expired` `abandoned` `voided` |
| `outcome` | TEXT | `pass` `fail` `inconclusive` — null until scored |
| `total_score` | NUMERIC | |
| `started_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | hard expiry — see §12.4 |
| `submitted_at` | TIMESTAMPTZ | |
| `scored_at` | TIMESTAMPTZ | **drives the cooling calculation** |
| `attempt_number` | INT | 1-based, per candidate+role |
| `is_deleted` | BOOLEAN | |

Indexes for the hot path:

```sql
CREATE INDEX idx_sessions_elig
  ON tmext_ai_assessment_sessions (candidate_id, role_id, status, scored_at DESC)
  WHERE is_deleted = false;

CREATE INDEX idx_sessions_active
  ON tmext_ai_assessment_sessions (candidate_id, role_id)
  WHERE is_deleted = false AND status IN ('in_progress','submitted','scoring');
```

### 6.3 `tmext_ai_assessment_settings`

Global row plus optional per-role overrides. Lookup: role-scoped row if present, else global.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | UUID | | PK |
| `role_id` | INTEGER | NULL | NULL = global default |
| `cooling_period_pass_days` | INT | 180 | carry-forward validity |
| `cooling_period_fail_days` | INT | 90 | retry lockout |
| `max_attempts` | INT | 2 | NULL = unlimited |
| `score_policy` | TEXT | `best` | `best` \| `latest` \| `average` |
| `session_ttl_minutes` | INT | 240 | hard expiry for an in-progress session |
| `recording_retention_days` | INT | 90 | proctoring media purge |
| `updated_by` | UUID | | |
| `updated_at` | TIMESTAMPTZ | | |

`score_policy`, `max_attempts` and the cooling periods come from `AI_Assessment_Module_Plan.txt`
§6B ("Retake Rules"), reconciled into the settings table so both documents describe one
mechanism rather than two.

---

## 7. Admin API for Requirements Table

```http
GET  /ai-assessment/api/v1/admin/requirements               → list all
POST /ai-assessment/api/v1/admin/requirements               → add entry
POST /ai-assessment/api/v1/admin/requirements/{id}/update   → edit
POST /ai-assessment/api/v1/admin/requirements/{id}/delete   → soft delete
```

All four require the `TA_ADMIN` role. All four write an audit row (§10).

**`GET` supports** `?role_id=`, `?program_type=`, `?required=`, `?page=`, `?page_size=`.

**`POST` (create) body**

```json
{ "role_id": 101, "role_name": "Retail Officer", "program_type": "lateral", "required": true }
```

`409 CONFLICT` if a live row already exists for that `(role_id, program_type)` — the unique
indexes in §2.1 make this deterministic rather than a race.

### 7.1 Settings API

```http
GET  /ai-assessment/api/v1/admin/settings                   → global + all overrides
POST /ai-assessment/api/v1/admin/settings/update            → update global
POST /ai-assessment/api/v1/admin/settings/{role_id}/update  → upsert role override
```

### 7.2 Manual attempt grant

Required by the `MAX_ATTEMPTS_EXHAUSTED` path — a recruiter must be able to grant an
exception without an admin editing global config.

```http
POST /ai-assessment/api/v1/recruiter/candidates/{candidate_id}/grant-attempt
{ "role_id": 101, "reason": "Power cut mid-test, verified with candidate" }
```

Role: `RECRUITER` or `TA_ADMIN`. `reason` is mandatory and audited. Increments that
candidate's attempt budget for that role by one; it does not change global settings.

---

## 8. Errors

Uniform envelope. `success: false` and an `error` object.

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PROGRAM_TYPE",
    "message": "program_type must be one of: lateral, campus, referral, vendor, job_portal",
    "field": "program_type",
    "request_id": "6b1f..."
  }
}
```

| HTTP | code | When |
|---|---|---|
| 400 | `MISSING_FIELD` | `role_id` or `program_type` absent |
| 400 | `INVALID_PROGRAM_TYPE` | not one of the five enum values |
| 400 | `INVALID_ROLE_ID` | not a positive integer |
| 401 | `UNAUTHENTICATED` | JWT missing, malformed or expired |
| 403 | `FORBIDDEN` | token is not a candidate token (e.g. recruiter calling it) |
| 404 | `ROLE_NOT_FOUND` | `role_id` absent from `tmext_job` |
| 429 | `RATE_LIMITED` | > 30 calls/min per candidate |
| 500 | `INTERNAL_ERROR` | unhandled |
| 503 | `SETTINGS_UNAVAILABLE` | settings table unreachable — **fail closed**, see below |

**Fail-safe vs fail-closed.** Invariant 3 says a requirements *miss* is `NOT_APPLICABLE` —
a missing row is a legitimate answer meaning "no assessment needed", and blocking the
candidate over it would be wrong. A settings table that is *unreachable* is different: we
cannot compute a cooling window at all, so returning `ELIGIBLE` risks letting a candidate
inside a lockout re-test. Return `503` and let the ATS retry.

---

## 9. Security

1. `candidate_id` is read from the JWT `sub` claim only. If the request body contains a
   `candidate_id` key, reject with `400` rather than ignoring it — silently dropping it
   invites a caller to believe impersonation worked. *(Invariant 1, enforced)*
2. The endpoint requires a candidate token. Recruiter and admin tokens get `403`.
3. Rate limit 30/min per candidate, 1000/min per ATS service account.
4. All admin endpoints require `TA_ADMIN`; `grant-attempt` requires `RECRUITER`+.
5. Responses carry `Cache-Control: no-store` — eligibility is a point-in-time decision and
   must never be cached by a browser or CDN.
6. The response leaks no other candidate's data and no scores — only this candidate's own
   status.

---

## 10. Audit

Every eligibility evaluation and every admin mutation writes to `tmext_ai_assessment_audit`:

| Column | Notes |
|---|---|
| `id` | UUID |
| `actor_type` | `candidate` \| `recruiter` \| `admin` \| `system` |
| `actor_id` | UUID |
| `action` | `eligibility.evaluate` \| `requirements.create` \| `settings.update` \| `attempt.grant` … |
| `entity_type`, `entity_id` | target |
| `before`, `after` | JSONB — null `before` on create |
| `request_id` | correlation |
| `created_at` | TIMESTAMPTZ |

Eligibility evaluations are audited because "why was this candidate skipped?" is a question
the bank's compliance team will eventually ask, and reconstructing it from settings that
have since changed is otherwise impossible.

---

## 11. Test Matrix

| # | Scenario | Expected `status` / `reason` | `show_button` |
|---|---|---|---|
| 1 | Role not in requirements table | `NOT_APPLICABLE` / `ROLE_NOT_REQUIRED` | false |
| 2 | Row exists, `required = false` | `NOT_APPLICABLE` / `ROLE_NOT_REQUIRED` | false |
| 3 | Exact row `true`, wildcard row `false` | exact wins → evaluate on | — |
| 4 | Only wildcard row, `required = true` | wildcard applies → evaluate on | — |
| 5 | Required, no prior session | `ELIGIBLE` / `NO_PRIOR_RECORD` | true |
| 6 | Session `in_progress`, not expired | `PENDING` / `ATTEMPT_IN_PROGRESS` | false |
| 7 | Session `submitted`, awaiting scoring | `PENDING` / `ATTEMPT_IN_PROGRESS` | false |
| 8 | Session `in_progress` past `expires_at` | expire it, then evaluate history | — |
| 9 | Prior pass, within cooling | `SKIP` / `PRIOR_PASS_IN_COOLING` | false |
| 10 | Prior pass, cooling expired | `ELIGIBLE` / `PRIOR_PASS_COOLING_EXPIRED` | true |
| 11 | Prior fail, within cooling | `PENDING_COOLING` / `PRIOR_FAIL_IN_COOLING` | false |
| 12 | Prior fail, cooling expired, attempts left | `ELIGIBLE` / `PRIOR_FAIL_COOLING_EXPIRED` | true |
| 13 | Prior fail, cooling expired, attempts spent | `NOT_ELIGIBLE` / `MAX_ATTEMPTS_EXHAUSTED` | false |
| 14 | Attempts spent, then recruiter grants one | `ELIGIBLE` / `PRIOR_FAIL_COOLING_EXPIRED` | true |
| 15 | Two scored sessions — most recent drives it | evaluated on latest `scored_at` | — |
| 16 | Prior session for a *different* role | ignored → `NO_PRIOR_RECORD` | true |
| 17 | `candidate_id` supplied in body | `400` | — |
| 18 | Recruiter JWT | `403` | — |
| 19 | Expired JWT | `401` | — |
| 20 | Settings table down | `503` / `SETTINGS_UNAVAILABLE` | — |
| 21 | Outcome `inconclusive` (voided for fraud) | treated as no valid result → recruiter decides | false |
| 22 | `max_attempts = NULL` | attempt check skipped, unlimited | — |

---

## 12. Changes From the Attached Spec

Four gaps and one addition, each with the reasoning. **These need business sign-off.**

### 12.1 Step ordering — a live logic bug in the original

The original runs history (Step 2) before the in-progress check (Step 3):

> **Step 2** — Any prior **scored** session for this candidate_id + role_id?
> No → `ELIGIBLE (NO_PRIOR_RECORD)`, **stop**

A candidate who is *currently mid-test* and has never completed one before has **no scored
session**. Step 2 therefore returns `ELIGIBLE / NO_PRIOR_RECORD` and stops — Step 3's
`ATTEMPT_IN_PROGRESS` branch is unreachable for exactly the first-attempt case it most
needs to cover. The candidate is offered a second "Start Assessment" button while their
first attempt is still running.

**Fix:** move the active-session check ahead of the history check (now Step 2). No change
to statuses, reasons or the ATS contract — only evaluation order.

### 12.2 `MAX_ATTEMPTS_EXHAUSTED` — new status

`AI_Assessment_Module_Plan.txt` §6B specifies "how many attempts allowed (e.g. max 2
attempts)", but the eligibility spec has no status for a spent budget. Without one, a
candidate who has failed twice and waited out the cooling period returns
`ELIGIBLE / PRIOR_FAIL_COOLING_EXPIRED` forever, and the attempt limit is unenforceable at
the only point where it matters.

Adds one `status` (`NOT_ELIGIBLE`), one `reason`, and the `grant-attempt` escape hatch
(§7.2) so a genuine mishap — power cut, device failure — has a supported path that is not
"an admin edits global config".

### 12.3 Cooling period split into pass and fail

The original reads a single cooling value for both outcomes. They are different mechanisms
pointing in opposite directions: pass-cooling is a *validity window* (long — spares a good
candidate a re-test), fail-cooling is a *lockout* (short — lets a candidate improve and
return). One shared value forces a bad trade: long enough to be a useful carry-forward, and
you have locked out failed candidates for six months.

Two config keys, both defaulted, both admin-editable. Set them to the same value to
reproduce the original behaviour exactly.

### 12.4 Session hard expiry

The original's `ATTEMPT_IN_PROGRESS` has no exit. A candidate whose laptop dies mid-test
leaves a session `in_progress` forever, and every future eligibility call returns `PENDING`
with `show_button: false` — a permanent, silent block with no self-service recovery.

Adds `expires_at` (from `session_ttl_minutes`, default 240) and a lazy sweep at Step 2: a
session past its expiry is marked `expired` and evaluation continues. A nightly job does the
same for sessions never re-queried.

### 12.5 Additive response fields

`attempts_used`, `max_attempts`, `blueprint_id`, `estimated_duration_minutes`,
`evaluated_at`. All additive; no existing field changes. They exist so the candidate-facing
screen can say *"Attempt 2 of 2 · about 105 minutes"* instead of a bare button, which is
the difference between a candidate who prepares and one who starts a 105-minute proctored
test on a phone in a coffee shop.

---

## 13. Invariants

Original six, preserved verbatim, plus three from the changes above.

1. `candidate_id` always from JWT — never accepted in request body
2. `role_id` is an integer — matches role ID from `tmext_job`
3. Requirements table miss (no row found) defaults to `NOT_APPLICABLE` — fail safe
4. Cooling period is config-driven — no hardcoded value
5. `show_button` is the only field the frontend should branch on
6. ATS stores the eligibility outcome on the application — assessment module does not write to ATS
7. Exact `program_type` match always beats the `NULL` wildcard
8. The active-session check always precedes the history check
9. Cooling is measured from `scored_at`, never from `submitted_at` or `started_at` — a slow
   scoring queue must not shorten a candidate's lockout or lengthen a carry-forward
