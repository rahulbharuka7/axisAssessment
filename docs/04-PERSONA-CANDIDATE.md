# 04 — Persona: Candidate

> *"Tell me if I need to do this, let me do it without fighting the software, tell me what happened."*

The candidate is the only persona who did not choose to be here, cannot be trained, and is
judged by the result. Every friction we add costs us a real applicant — disproportionately
the ones on weaker hardware and slower connections.

**Role code:** `CANDIDATE` · **Volume:** thousands · **Frequency:** once or twice, ever

---

## 1. Design Principles

1. **Never lose an answer.** Auto-save on every interaction; a dropped connection must be
   invisible. This is the single highest-value engineering investment in the module.
2. **Degrade, never block.** 512 kbps and a 4 GB laptop is the floor, not an edge case
   (attachment 1, "Things to keep in mind").
3. **No surprises.** Duration, section count, attempt number, proctoring scope and consent
   are all shown *before* start — never revealed mid-test.
4. **Consent is real.** Explicit, informed, revocable before start, and declining is
   recorded as "declined", never as a failure.
5. **Say what happens next.** A candidate who finishes should never wonder whether it
   submitted.
6. **Accessible.** WCAG 2.1 AA: keyboard navigation, screen-reader labels, 4.5:1 contrast,
   no colour-only meaning, respects reduced-motion.

---

## 2. The Candidate Journey

```
ATS: application reaches Shortlisted
   │
   ▼
POST /eligibility  ─────────────────────────────┐
   │                                            │
   ├─ show_button:false  NOT_APPLICABLE  ──▶ no assessment shown, pipeline continues
   ├─ show_button:false  SKIP            ──▶ "Your previous result has been carried forward"
   ├─ show_button:false  PENDING_COOLING ──▶ "Assessment available from 14 Nov 2026"
   ├─ show_button:false  PENDING         ──▶ "Resume assessment" (session already open)
   ├─ show_button:false  NOT_ELIGIBLE    ──▶ "Attempts used — contact your recruiter"
   └─ show_button:true   ELIGIBLE        ──▶ [ Start Assessment ]
                                            │
                                            ▼
                                    ① Instructions & consent
                                            ▼
                                    ② System check
                                            ▼
                                    ③ Identity verification
                                            ▼
                                    ④ Test
                                            ▼
                                    ⑤ Submission & confirmation
                                            ▼
                                    ⑥ Outcome (per policy)
```

The five `show_button: false` branches each get **their own screen with their own copy**.
A single generic "assessment not available" for all of them is the most common way this
kind of integration frustrates candidates — "carried forward" is good news and
"attempts used" needs an action, and they must not look the same.

---

## 3. Screens

### 3.1 Assessment Landing

Everything the candidate needs to decide *when* to sit down.

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   Retail Officer Assessment                                            │
│   Axis Bank                                                            │
│                                                                        │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                  │
│   │ ⏱  105 min   │ │ ▤  4 sections│ │ ↻  Attempt   │                  │
│   │   total      │ │   141 items  │ │   1 of 2     │                  │
│   └──────────────┘ └──────────────┘ └──────────────┘                  │
│                                                                        │
│   WHAT YOU WILL BE ASKED                                               │
│   1  Cognitive Ability      16 questions   20 min                      │
│   2  Written English         1 question    15 min                      │
│   3  Spoken English         64 questions   45 min   🎤 microphone       │
│   4  Sales Personality      no time pressure       25 min              │
│                                                                        │
│   BEFORE YOU START                                                     │
│   ·  You need a working webcam and microphone                          │
│   ·  This test is proctored and recorded                               │
│   ·  Find a quiet, well-lit room where you will not be interrupted     │
│   ·  Once started, the timer does not pause                            │
│   ·  Your answers save automatically                                   │
│                                                                        │
│   This test window closes on 10 Sep 2026, 11:59 PM.                    │
│                                                                        │
│                    [ Continue to system check ]                        │
└────────────────────────────────────────────────────────────────────────┘
```

`estimated_duration_minutes` and `attempts_used` / `max_attempts` come straight from the
eligibility response (doc 05 §12.5) — this screen is the reason those fields were added.

### 3.2 Consent

```
┌────────────────────────────────────────────────────────────────────────┐
│   Proctoring consent                                                   │
│                                                                        │
│   To keep this assessment fair, Axis Bank will record:                 │
│     ·  Video from your webcam for the duration of the test             │
│     ·  Audio from your microphone                                      │
│     ·  Your screen                                                     │
│     ·  A photo of you and your ID for identity verification            │
│                                                                        │
│   HOW IT IS USED                                                       │
│   ·  Reviewed by the Axis Bank hiring team if something is flagged     │
│   ·  Automated checks assist that review — they never decide alone     │
│   ·  Deleted automatically after 90 days                               │
│   ·  Never shared outside Axis Bank's hiring process                   │
│                                                                        │
│   You may withdraw consent by closing this page before starting.       │
│   You cannot take the assessment without consenting.                   │
│   Declining is recorded as "consent declined", not as a failed test.   │
│                                                                        │
│   ☐  I have read and consent to the above.                             │
│                                                                        │
│              [ I do not consent ]      [ I consent — continue ]        │
└────────────────────────────────────────────────────────────────────────┘
```

Consent version, timestamp and IP are written to the consent register (doc 02 §2.6).

### 3.3 System Check

Runs before the timer starts, so nothing here costs the candidate time.

```
   Checking your setup                                          4 of 5 ✓

   ✓  Browser              Chrome 128 — supported
   ✓  Camera               Working
   ✓  Microphone           Working — say something to test
        ▁▃▅▇▅▃▁▃▅▇▅▃▁
   ✓  Screen sharing       Permission granted
   ⟳  Internet speed       Testing…  2.4 Mbps

   ┌──────────────────────────────────────────────────────────────────┐
   │  ⓘ  Your connection is slower than we recommend.                 │
   │     The test will still work — we will record at a lower         │
   │     quality and save your answers more often.                    │
   │     [ Continue anyway ]  [ Retest ]                              │
   └──────────────────────────────────────────────────────────────────┘
```

A slow connection produces an **adaptation, not a rejection** — lower recording bitrate,
more frequent answer sync, prefetched next question. Attachment 1 is explicit that not every
candidate has a good setup.

Every failure state offers a concrete fix ("Camera blocked — click the 🔒 icon in your
address bar and allow camera access") and a retry, never a dead end.

### 3.4 Identity Verification

```
   Step 1 of 2 — Photo of you
   ┌──────────────────┐    Look straight at the camera.
   │   [live camera]  │    Make sure your face is well lit.
   │      ( ◕‿◕ )     │
   └──────────────────┘    [ Capture ]

   Step 2 of 2 — Photo of your ID
   ┌──────────────────┐    Hold your Aadhaar / PAN / Passport
   │   [live camera]  │    steady inside the frame.
   └──────────────────┘    [ Capture ]

   ✓  Identity verified — 94% match
```

On a low match score the candidate gets **two retries with guidance** before the session is
routed to manual recruiter verification. A poorly-lit room is not fraud, and a hard failure
here would reject honest candidates at the door.

### 3.5 Test Runtime

One question at a time with a timer, per attachment 1 §A.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Section 1 of 4 · Cognitive Ability      Q 7/16      ⏱ 12:34   ● REC    │
│ ▓▓▓▓▓▓▓░░░░░░░░░                                        ✓ Saved       │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  A branch processed 1,240 transactions in March, 18% more than in      │
│  February. How many were processed in February?                        │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  [ chart image — click to enlarge ]                              │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│   ○  1,020        ○  1,051        ○  1,102        ○  1,183            │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ [◀ Previous]   [🔖 Mark for review]              [Next ▶]  [Submit]   │
└────────────────────────────────────────────────────────────────────────┘
```

**Per question type:**

| Type | Candidate experience |
|---|---|
| MCQ single/multi | Radio / checkbox, keyboard-selectable |
| Short & long text | Rich-enough textarea, live word count, autosave every 3 s |
| Image prompt | Zoomable, pannable image; alt text for screen readers |
| Image upload | Camera or file; preview, retake, up to N images, 10 MB each |
| Audio response (SpeechX) | Record → playback → re-record once; live level meter |
| Likert / SJT | Forced-choice or ranked drag list, keyboard-reorderable |

**Persistence.** Answers write to IndexedDB immediately and sync to the server on a debounce.
Going offline shows a quiet amber "Offline — your answers are saved on this device and will
sync automatically" banner; the timer keeps running server-authoritatively and reconciles on
reconnect. Nothing is lost. *(Attachment 1 §A: "Auto-saves answers so nothing is lost if
internet drops.")*

**Proctoring surface.** A small persistent `● REC` indicator and a self-view thumbnail —
the candidate always knows they are being recorded. Warnings are calm and specific:

```
   ┌──────────────────────────────────────────────────────────┐
   │  ⚠  Please stay on this tab                              │
   │     Switching away is recorded. Warning 1 of 3.          │
   │                                       [ Got it ]         │
   └──────────────────────────────────────────────────────────┘
```

Never accusatory, always with the count remaining, and the configured action on limit
(attachment 1 §6C) is stated up front rather than sprung.

### 3.6 Submission

```
   ✓  Assessment submitted

      Retail Officer Assessment
      Submitted 3 Sep 2026, 2:47 PM
      Reference  ASMT-2026-004821

      All 141 answers were received.

      WHAT HAPPENS NEXT
      Your responses are being evaluated. The Axis Bank hiring team will
      review your assessment and contact you about next steps.
      You do not need to do anything further.

                        [ Back to my application ]
```

The explicit "all 141 answers were received" is deliberate — the most common post-test
anxiety is "did it actually save?", and answering it here prevents a support contact.

### 3.7 Outcome

Visibility is policy-controlled by the Admin. Three configurable levels:

| Level | Candidate sees |
|---|---|
| None | Status only — "under review" |
| Basic | Pass / fail and next step |
| Detailed | Overall band + section feedback against competencies |

Scores are **never shown alongside proctoring flags**. A candidate must not be able to infer
what the detector caught — that is a roadmap for the next attempt.

If the outcome is a fail and a retake is permitted, the screen shows exactly when:

```
   You may reattempt this assessment from 2 Dec 2026.
   This will be attempt 2 of 2.
```

That date is `cooling_ends_at` from the eligibility response — the same field the ATS reads.

---

## 4. Failure & Edge Cases

| Situation | Behaviour |
|---|---|
| Browser closes mid-test | Session stays `in_progress`; returning resumes at the same question with the timer where it stands |
| Laptop dies, never returns | Session hits `expires_at` (default 240 min), auto-expires, stops blocking future eligibility (doc 05 §12.4) |
| Internet drops for 3 minutes | Offline banner; answers buffer locally; sync and reconcile on reconnect |
| Camera unplugged mid-test | Warning, 60-second grace to reconnect, then flagged — never auto-terminated |
| Genuine power cut | Recruiter grants an extra attempt (doc 05 §7.2) with an audited reason |
| Time expires | Auto-submit with everything answered so far, per attachment 1 §A |
| Consent declined | Recorded as `consent_declined`; recruiter notified; **not** a fail |
| Screen reader in use | Full keyboard path; proctoring warnings announced via ARIA live regions |
| Assistive-tech false flags | Screen-reader and magnifier usage must not raise a proctoring flag — a known bias source, explicitly tested |
