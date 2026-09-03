# ThriveHR — Assessment Eligibility API

## 1. Purpose

A single API that ATS calls when a candidate reaches **Shortlisted** to determine whether to show the "Start Assessment" button or skip the assessment entirely.

The assessment module owns the eligibility logic. ATS acts on the response.

---

## 2. Requirements Config Table

TA-Admin maintains this table. It defines whether assessment is required for a given role + program type combination.

```
tmext_ai_assessment_requirements

id          | role_id (int) | role_name          | program_type  | required
------------|---------------|--------------------|---------------|----------
uuid        | 101           | Retail Officer     | lateral       | true
uuid        | 101           | Retail Officer     | campus        | false
uuid        | 102           | Branch Manager     | lateral       | true
uuid        | 103           | Campus Graduate    | campus        | false
```

- `role_id` — integer, matches role ID from `tmext_job`
- `role_name` — display name, denormalised for readability
- `program_type` — `lateral` / `campus` / `referral` / `vendor` / `job_portal`
- `required` — true / false
- NULL `program_type` = applies to all program types (wildcard)

---

## 3. Eligibility API

### Request

```
POST /ai-assessment/api/v1/eligibility
Auth: candidate JWT (candidate_id extracted from token)

{
  "role_id": 101,
  "program_type": "lateral"
}
```

`candidate_id` comes from the JWT — not in the request body.

### Internal Logic (in order)

```
Step 1 — Check requirements table
         role_id + program_type → required = false?
         → NOT_APPLICABLE, stop

Step 2 — Check session history
         Any prior scored session for this candidate_id + role_id?
         No → ELIGIBLE (NO_PRIOR_RECORD), stop

Step 3 — Check outcome + cooling period
         Passed + within cooling window  → SKIP
         Passed + cooling expired        → ELIGIBLE (PRIOR_PASS_COOLING_EXPIRED)
         Failed + within cooling window  → PENDING_COOLING
         Failed + cooling expired        → ELIGIBLE (PRIOR_FAIL_COOLING_EXPIRED)
         Session in progress             → PENDING (ATTEMPT_IN_PROGRESS)
```

Cooling period value is read from `tmext_ai_assessment_settings` (configured by TA-Admin, sourced from `tmext_admin`).

### Response

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
    "cooling_ends_at": null
  }
}
```

`show_button` is the single field the frontend reads to show or hide the CTA.

---

## 4. All Statuses

| status | reason | show_button | Meaning |
|---|---|---|---|
| `NOT_APPLICABLE` | `ROLE_NOT_REQUIRED` | false | Role + program type not in requirements table or marked false |
| `SKIP` | `PRIOR_PASS_IN_COOLING` | false | Passed before, cooling period still active — carry forward |
| `PENDING_COOLING` | `PRIOR_FAIL_IN_COOLING` | false | Failed before, cooling period still active |
| `PENDING` | `ATTEMPT_IN_PROGRESS` | false | Active session exists right now |
| `ELIGIBLE` | `NO_PRIOR_RECORD` | true | Never taken this assessment |
| `ELIGIBLE` | `PRIOR_FAIL_COOLING_EXPIRED` | true | Failed before but cooling has expired |
| `ELIGIBLE` | `PRIOR_PASS_COOLING_EXPIRED` | true | Passed before but cooling has expired — fresh attempt needed |

---

## 5. What ATS Does With the Response

| show_button | ATS action |
|---|---|
| `true` | Surface "Start Assessment" CTA to candidate. Store `assessment_status = pending` on application. |
| `false` + `SKIP` | Store `assessment_status = carried_forward`, link `assessment_session_id` to prior session. Pipeline continues. |
| `false` + `NOT_APPLICABLE` | Store `assessment_status = not_applicable`. Pipeline continues. |
| `false` + `PENDING_COOLING` | Store `assessment_status = cooling`. Surface "Assessment available from {cooling_ends_at}" to candidate. |
| `false` + `PENDING` | Do nothing — session already in progress. |

---

## 6. Tables

| Table | Purpose |
|---|---|
| `tmext_ai_assessment_requirements` | role_id + role_name + program_type → required true/false |
| `tmext_ai_assessment_sessions` | history lookup — candidate_id + role_id + outcome + scored_at |
| `tmext_ai_assessment_settings` | cooling period value |

### tmext_ai_assessment_requirements columns

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

---

## 7. Admin API for Requirements Table

```
GET  /ai-assessment/api/v1/admin/requirements          → list all
POST /ai-assessment/api/v1/admin/requirements          → add entry
POST /ai-assessment/api/v1/admin/requirements/{id}/update  → edit
POST /ai-assessment/api/v1/admin/requirements/{id}/delete  → soft delete
```

---

## 8. Invariants

1. `candidate_id` always from JWT — never accepted in request body
2. `role_id` is an integer — matches role ID from `tmext_job`
3. Requirements table miss (no row found) defaults to `NOT_APPLICABLE` — fail safe
4. Cooling period is config-driven — no hardcoded value
5. `show_button` is the only field the frontend should branch on
6. ATS stores the eligibility outcome on the application — assessment module does not write to ATS
