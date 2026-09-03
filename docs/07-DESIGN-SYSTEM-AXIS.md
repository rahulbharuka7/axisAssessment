# 07 — Design System: Axis Burgundy

> **Verification note.** `axisbank.com` is blocked by this environment's network egress
> proxy, so the values below could not be sampled from the live site. They are reconstructed
> from the Axis Bank Burgundy identity — deep burgundy primary, gold accent, high-contrast
> neutrals. **Every hex value must be validated against the official Axis Bank brand
> guidelines before build.** The token *structure*, contrast ratios and component specs
> hold regardless of the final values; only the hex constants would change.
>
> (The reference URL in the brief, `axis.bank.in`, is a typo for `axisbank.com`.)

---

## 1. Design Intent

Mettl's UI is functional and neutral — it looks like testing software. Axis Burgundy is a
premium banking identity: deep, confident, restrained, with gold used sparingly as a mark of
quality rather than as decoration.

**The blend:** Mettl's information density and workflow clarity, wearing Axis Burgundy's
restraint.

Three rules that keep it from becoming a gaudy maroon skin over a test engine:

1. **Burgundy is for identity and action, not for surfaces.** Headers, primary buttons,
   active states, brand marks. Never a page background behind body text.
2. **Gold is a seal, never a signal.** Section rules, premium badges, dividers. Gold on
   white is 2.1:1 — it cannot carry text or convey state.
3. **Status colour is never burgundy.** Risk levels, pass/fail and validation use a separate
   semantic ramp. If burgundy meant both "primary action" and "high risk", every screen in
   doc 03 would be unreadable.

---

## 2. Colour Tokens

### 2.1 Burgundy — primary

| Token | Hex | Use | On white |
|---|---|---|---|
| `--axis-burgundy-900` | `#4A0A26` | Deepest — headers on light, text on gold | 15.9:1 |
| `--axis-burgundy-800` | `#6B0E37` | Hover on primary | 11.4:1 |
| `--axis-burgundy-700` | `#7B0F3E` | Pressed state | 10.1:1 |
| **`--axis-burgundy-600`** | **`#97144D`** | **Primary brand — buttons, header, active** | **8.3:1** ✓ AAA |
| `--axis-burgundy-500` | `#AE275F` | Secondary action, links on white | 6.5:1 ✓ AA |
| `--axis-burgundy-400` | `#C4527F` | Disabled primary, decorative | 4.1:1 |
| `--axis-burgundy-300` | `#D98BA8` | Borders on burgundy surfaces | — |
| `--axis-burgundy-200` | `#EBC2D3` | Selected-row tint | — |
| `--axis-burgundy-100` | `#F7E6ED` | Subtle fill, hovered row | — |
| `--axis-burgundy-50` | `#FDF5F8` | Page-section wash | — |

### 2.2 Gold — premium accent

| Token | Hex | Use |
|---|---|---|
| `--axis-gold-600` | `#A67C00` | Gold text — **only** on burgundy-800/900 (6.1:1) |
| `--axis-gold-500` | `#C9A227` | Badges, section rules |
| `--axis-gold-400` | `#D4AF37` | Primary gold — dividers, seals, **never text on white** (2.1:1) |
| `--axis-gold-100` | `#F5EDD6` | Gold wash |

> ⚠ `#D4AF37` on white is **2.1:1** — well below the 4.5:1 minimum. Gold may never carry
> body text, labels, or any state meaning on a light surface. This is the single most
> likely accessibility failure in a burgundy-and-gold system.

### 2.3 Neutrals

| Token | Hex | Use |
|---|---|---|
| `--axis-ink-900` | `#1A1A1A` | Primary text (16.1:1) |
| `--axis-ink-700` | `#3D3D3D` | Body text (10.9:1) |
| `--axis-ink-500` | `#6B6B6B` | Secondary text (5.3:1) |
| `--axis-ink-300` | `#A3A3A3` | Placeholder, disabled (2.6:1 — non-text only) |
| `--axis-line` | `#E2E2E2` | Borders, dividers |
| `--axis-surface-alt` | `#F7F7F8` | Card and table-stripe background |
| `--axis-surface` | `#FFFFFF` | Page background |

### 2.4 Semantic — status, risk, validation

Deliberately outside the brand ramp.

| Token | Hex | Meaning |
|---|---|---|
| `--axis-success-600` | `#1B7F4C` | Pass, verified, low risk (4.8:1) |
| `--axis-success-50` | `#E8F5EE` | Success fill |
| `--axis-warning-600` | `#B45309` | Medium risk, caution (4.6:1) |
| `--axis-warning-50` | `#FEF3E2` | Warning fill |
| `--axis-danger-600` | `#C0272D` | High risk, fail, violation (5.4:1) |
| `--axis-danger-50` | `#FCEAEA` | Danger fill |
| `--axis-info-600` | `#1D4ED8` | Informational (6.3:1) |

**Risk bands never rely on colour alone.** Every risk indicator pairs a colour with a filled
shape and a text label — `● Low` / `◐ Medium` / `▲ High` — so it survives greyscale printing
and colour-vision deficiency. Doc 03's dashboard is unusable otherwise.

---

## 3. Typography

Axis's own brand face where licensed; otherwise a system stack that holds the same
proportions.

```css
--axis-font-display: 'Axis Sans', 'Aeonik', 'Inter', -apple-system,
                     'Segoe UI', Roboto, sans-serif;
--axis-font-body:    'Inter', -apple-system, 'Segoe UI', Roboto,
                     'Helvetica Neue', Arial, sans-serif;
--axis-font-mono:    'JetBrains Mono', 'SF Mono', Consolas, monospace;
```

Mono is used for reference numbers (`ASMT-2026-004821`), timestamps and score tables, where
digit alignment matters.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display-lg` | 40 / 48 | 700 | Landing hero |
| `display-sm` | 32 / 40 | 700 | Page title |
| `heading-lg` | 24 / 32 | 600 | Section heading |
| `heading-sm` | 18 / 26 | 600 | Card title |
| `body-lg` | 16 / 26 | 400 | **Question text — never smaller** |
| `body` | 14 / 22 | 400 | Default UI |
| `body-sm` | 13 / 20 | 400 | Table cells, metadata |
| `caption` | 12 / 18 | 500 | Labels, timestamps |

**Question text is 16px minimum.** A candidate reading a numerical-reasoning item under time
pressure on a 13" laptop is the worst place to save vertical space.

---

## 4. Spacing, Radius, Elevation

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 24px;  --space-6: 32px;  --space-7: 48px;  --space-8: 64px;

--radius-sm: 4px;    /* inputs, chips        */
--radius-md: 8px;    /* buttons, cards       */
--radius-lg: 12px;   /* modals, panels       */
--radius-full: 999px;/* pills, avatars       */

--shadow-sm: 0 1px 2px rgba(26,26,26,.06);
--shadow-md: 0 4px 12px rgba(26,26,26,.08);
--shadow-lg: 0 12px 32px rgba(26,26,26,.12);

/* Brand shadow — burgundy-tinted, for primary CTAs only */
--shadow-brand: 0 4px 14px rgba(151,20,77,.24);
```

8px base grid throughout. Radii stay modest — banking, not consumer app.

---

## 5. Components

### 5.1 Buttons

```
┌──────────────────────┐   Primary
│  Start Assessment    │   bg burgundy-600 · text white · radius-md
└──────────────────────┘   hover burgundy-800 · active burgundy-700
                           shadow-brand · height 44px · padding 0 24px

┌──────────────────────┐   Secondary
│  Save draft          │   bg white · 1px burgundy-600 · text burgundy-600
└──────────────────────┘   hover bg burgundy-50

┌──────────────────────┐   Tertiary / ghost
│  Cancel              │   transparent · text ink-700 · hover surface-alt
└──────────────────────┘

┌──────────────────────┐   Destructive
│  Reject candidate    │   bg danger-600 · text white
└──────────────────────┘
```

- Minimum touch target **44 × 44px**.
- Focus ring: `0 0 0 3px rgba(151,20,77,.35)` — always visible, never removed.
- A button that triggers an irreversible action (publish, reject, purge) requires
  confirmation.

### 5.2 Cards

```
┌─────────────────────────────────────────────┐
│ ┃ Retail Officer — Lateral Q3    [Live]     │   1px line border
│ ┃                                            │   radius-lg · shadow-sm
│ ┃ 120 invited · 84 completed · 12 flagged    │   3px burgundy-600 left rule
│ ┃                                [ Open ]    │   on the active card only
└─────────────────────────────────────────────┘
```

The left rule is the one place burgundy appears as a block of colour on a light card — it
reads as a bank statement's ledger mark rather than as decoration.

### 5.3 Status pills

```
● Low       success-600 on success-50    filled circle
◐ Medium    warning-600 on warning-50    half circle
▲ High      danger-600  on danger-50     triangle
◇ Pending   ink-500     on surface-alt   diamond
✓ Passed    success-600 on success-50    check
✕ Failed    danger-600  on danger-50     cross
```

Shape + colour + label. Never colour alone.

### 5.4 Data table

Recruiter dashboards are dense; density is a feature.

- Row height 48px; sticky header; sticky first column on horizontal scroll.
- Zebra striping via `surface-alt`; hover `burgundy-50`; selected `burgundy-100`.
- Numeric columns right-aligned, mono, tabular figures.
- Sortable headers show direction with a caret **and** an `aria-sort` attribute.
- Empty state carries an action, never just "No data".

### 5.5 Progress & timer

```
Section 1 of 4 · Cognitive Ability      Q 7/16      ⏱ 12:34
▓▓▓▓▓▓▓░░░░░░░░░
```

- Progress fill `burgundy-600` on `burgundy-100`.
- Timer switches to `warning-600` at 20% remaining, `danger-600` at 10%.
- **The timer never flashes or pulses** — it raises anxiety and produces worse test
  performance without improving compliance. It changes colour and nothing else.

### 5.6 Proctoring indicators

```
● REC    danger-600 dot, 1.5s fade cycle, always visible top-right
         Respects prefers-reduced-motion: static dot, no fade.

┌────────┐   Self-view, 96×72, bottom-right, draggable, dismissible
│  ( ◕‿◕)│   to a small badge — never fully hidden.
└────────┘
```

### 5.7 Header

```
┌────────────────────────────────────────────────────────────────┐
│ [Axis logo]  Assessments   Question Bank   Reports    [Priya ▾]│   burgundy-600
└────────────────────────────────────────────────────────────────┘   white text
              ▔▔▔▔▔▔▔▔▔▔▔                                            gold-400 3px
                                                                     active underline
```

The **candidate test runtime uses a stripped header** — logo, section, timer, REC indicator.
No navigation at all, which is both a proctoring requirement and a focus one.

---

## 6. Persona Theming

One design system, three densities. The tokens do not change; the layout does.

| | Admin | Recruiter | Candidate |
|---|---|---|---|
| Density | Compact | Compact | Comfortable |
| Base font | 14px | 14px | 16px |
| Max width | 1440 fluid | 1440 fluid | 720 centred |
| Nav | Left sidebar | Top + contextual left | None during test |
| Burgundy use | Header, active nav | Header, primary CTA | CTA + progress only |
| Gold use | Section rules | Premium badges | Landing hero rule only |
| Motion | Minimal | Minimal | Minimal, reduced-motion respected |

The candidate surface is the calmest on purpose. A proctored 105-minute test is stressful
enough without a busy interface competing for attention.

---

## 7. Accessibility Requirements

WCAG 2.1 AA, tested — not asserted.

| Requirement | Standard |
|---|---|
| Text contrast | ≥ 4.5:1 body, ≥ 3:1 large text |
| Non-text contrast | ≥ 3:1 for UI components and focus indicators |
| Keyboard | Every action reachable; visible focus; logical order; no traps |
| Screen reader | Semantic landmarks, labelled controls, `aria-live` for timer and warnings |
| Colour independence | No state conveyed by colour alone |
| Motion | `prefers-reduced-motion` disables the REC fade and all transitions |
| Zoom | Usable at 200% without horizontal scroll |
| Timing | Extended-time accommodation configurable per candidate |

**Accommodations are a first-class feature, not an exception path.** A candidate granted
extra time, or using a screen reader, must not thereby generate proctoring flags — an
assistive-technology user tabbing through a page is not a tab-switch violation. This is
tested explicitly (doc 04 §4).

---

## 8. Implementation

```
src/design-system/
  tokens/
    colors.css        ← §2, as CSS custom properties
    typography.css    ← §3
    spacing.css       ← §4
    index.css
  primitives/
    Button · Input · Select · Checkbox · Radio · Textarea
    Card · Table · Pill · Progress · Timer · Modal · Toast · Tabs
  patterns/
    PageHeader · FilterBar · EmptyState · StatCard
    RiskIndicator · SectionScoreBar · FlagTimeline
  themes/
    admin.css · recruiter.css · candidate.css   ← density only, not colour
```

Tokens ship as CSS custom properties so the whole palette can be re-pointed at the official
brand values in one file once the guidelines are confirmed — which is the reason the
verification note at the top of this document is not a blocker to starting the build.
