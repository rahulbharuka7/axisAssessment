/**
 * Seed from the three supplied blueprint spreadsheets.
 *
 * Competency names, definitions and behavioural indicators are transcribed from:
 *   - Copy of Mercer Mettl_Blueprint_Sample2.xlsx  (Cognitive + Writing + SpeechX)
 *   - Copy of Mercer Mettl_Blueprint_Sample3.xlsx  (SpeechX standalone)
 *   - SampleAssessment_Blueprint.xlsx              (Sales Personality — MPM + SJT)
 *
 * SpeechX is seeded at the row sum (64 questions), not the sheet header's 72.
 */
import { openDb, setDb, type DB } from './index.js';
import { uuid } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';

const now = nowIso();

interface CompetencySpec {
  name: string;
  definition: string;
  indicators: string[];
  tool: 'MCQ' | 'WRITING' | 'SPEECHX' | 'MPM' | 'SJT';
  rule: Record<string, unknown>;
  minutes: number | null;
  cutoff: number | null;
  subs?: string[];
}

interface MetaSpec {
  name: string;
  competencies: CompetencySpec[];
}

const FRAMEWORK: MetaSpec[] = [
  {
    name: 'Cognitive Ability',
    competencies: [
      {
        name: 'Analytical Ability and Problem Solving',
        definition:
          'Demonstrating the ability to analyse the given information from different perspectives by breaking it down into simple components and by structuring the information in a logical order to arrive at a solution.',
        indicators: [
          'Has a strong ability to differentiate between relevant and irrelevant information',
          'Can logically structure the relevant information points in systematic order',
          'Can analyse the relationship between different information points to deduce a logical conclusion',
          'Has an ability to validate the solution against the information given',
        ],
        tool: 'MCQ',
        rule: { type: 'difficulty_split', counts: { easy: 4, medium: 3, difficult: 1 }, randomize: true },
        minutes: 10,
        cutoff: 8,
      },
      {
        name: 'Numerical Ability',
        definition:
          'Demonstrating the ability to perceive and process numbers and related symbols to perform basic arithmetic operations.',
        indicators: [
          'Is able to perform basic arithmetic operations',
          'Has the ability to solve simple problems in work scenario requiring one to work with numbers',
          'Has numeric proficiency, accuracy and speed in doing calculations',
        ],
        tool: 'MCQ',
        rule: { type: 'difficulty_split', counts: { easy: 4, medium: 3, difficult: 1 }, randomize: true },
        minutes: 10,
        cutoff: 8,
      },
    ],
  },
  {
    name: 'Written English',
    competencies: [
      {
        name: 'Writing Skills',
        definition:
          'Demonstrating the ability to communicate via the written text and express ideas and thoughts effectively. It refers to the ability to write meaningful sentences which convey the message with clarity.',
        indicators: [
          'Expresses thoughts effectively in a clear and concise manner',
          'Is able to use correct grammar, spellings and punctuation in writing',
          'Is able to use rich vocabulary, while keeping the text simple to understand',
          'Is able to present written text in an easy to read manner',
        ],
        tool: 'WRITING',
        rule: { type: 'difficulty_split', counts: { easy: 0, medium: 1, difficult: 0 }, randomize: false },
        minutes: 15,
        cutoff: 10,
      },
    ],
  },
  {
    name: 'SpeechX Competencies',
    competencies: [
      {
        name: 'Pronunciation',
        definition:
          'Demonstrating the ablility to pronounce words correctly for the other person to comprehend the message being delivered.',
        indicators: [
          'Speaks in an accepted standard of the sound and stress patterns of a syllable, word, phrase, etc.',
          'Is able to send across a message without changing the meaning',
        ],
        tool: 'SPEECHX',
        rule: { type: 'fixed_count', count: 10, randomize: false },
        minutes: 10,
        cutoff: null,
      },
      {
        name: 'Fluency',
        definition:
          'Demonstrating the ability to express thoughts and ideas comfortably and smoothly in the English language.',
        indicators: [
          'Is able to communicate and express thoughts effectively',
          'Is fluent while speaking in terms of the rate of speech, pauses, and addition of fillers',
        ],
        tool: 'SPEECHX',
        rule: { type: 'fixed_count', count: 4, randomize: false },
        minutes: 10,
        cutoff: null,
      },
      {
        name: 'Grammar',
        definition:
          'Demonstrating the ability to write grammatically correct sentences by formulating simple sentences which conveys the message clearly.',
        indicators: [
          'Has a basic understanding of words and understands the differences between nouns, pronouns, etc.',
          'Knows the rules of grammar and is able to communicate effectively',
        ],
        tool: 'SPEECHX',
        rule: { type: 'fixed_count', count: 34, randomize: false },
        minutes: 15,
        cutoff: null,
      },
      {
        name: 'Listening Comprehension',
        definition:
          'Demonstrating the ability to attentively listen, receive and effectively understand what other people say, in a communication process.',
        indicators: [
          'Is good in comprehending information quickly and accurately while communicating with customers and clients',
          'Gains information/facts correctly from customers and clients during conversations',
          'Is able to help in making right decisions',
        ],
        tool: 'SPEECHX',
        rule: { type: 'fixed_count', count: 16, randomize: false },
        minutes: 10,
        cutoff: null,
      },
    ],
  },
  {
    name: 'Self-Management',
    competencies: [
      {
        name: 'Self-Management',
        definition: 'Managing one’s own emotions, confidence and resilience in a sales context.',
        indicators: [
          'Remains calm and composed while dealing with team members and customers under challenging circumstances',
          'Exhibits a high level of confidence in one’s own ability',
          'Stays optimistic in adverse or demanding situations',
        ],
        tool: 'MPM',
        rule: {
          type: 'instrument',
          instrument: 'MPM',
          instrument_version: 'mpm_sales_v2',
          sub_competencies: ['Self-control', 'Self-confidence', 'Stress Tolerance'],
          norm_group: 'sales_india_2026',
        },
        minutes: 8,
        cutoff: null,
        subs: ['Self-control', 'Self-confidence', 'Stress Tolerance'],
      },
    ],
  },
  {
    name: 'Managing the Sales Process',
    competencies: [
      {
        name: 'Managing the Sales Process',
        definition: 'Driving results, initiative, information seeking and problem solving through the sales cycle.',
        indicators: [
          'Ensures that one’s targets and goals are achieved in an effective manner',
          'Proactively takes up tasks, without being asked to',
          'Has the ability to gather information from various sources, as and when required',
          'Demonstrates the ability to resolve problems and issues by finding effective solutions',
        ],
        tool: 'SJT',
        rule: {
          type: 'instrument',
          instrument: 'SJT',
          instrument_version: 'sjt_sales_v1',
          sub_competencies: ['Result Orientation', 'Taking Initiatives', 'Information Seeking', 'Problem Solving'],
        },
        minutes: 10,
        cutoff: null,
        subs: ['Result Orientation', 'Taking Initiatives', 'Information Seeking', 'Problem Solving'],
      },
    ],
  },
  {
    name: 'Managing the Customer Relationship',
    competencies: [
      {
        name: 'Managing the Customer Relationship',
        definition: 'Building and sustaining customer relationships through empathy, networking and influence.',
        indicators: [
          'Recognizes and understands others’ emotions and feelings',
          'Connects with immediate stakeholders on a regular basis',
          'Identifies factors that capture people’s interest and utilizes the same to convince them',
          'Has the ability to accurately understand and promptly deliver on customer needs',
        ],
        tool: 'SJT',
        rule: {
          type: 'instrument',
          instrument: 'SJT',
          instrument_version: 'sjt_sales_v1',
          sub_competencies: ['Empathy', 'Networking with People', 'Influencing Others', 'Customer Service Orientation'],
        },
        minutes: 7,
        cutoff: null,
        subs: ['Empathy', 'Networking with People', 'Influencing Others', 'Customer Service Orientation'],
      },
    ],
  },
];

// ── question content ────────────────────────────────────────────────────────

const NUMERICAL = [
  { q: 'A branch processed 1,240 transactions in March, 18% more than in February. How many were processed in February?', o: ['1,020', '1,051', '1,102', '1,183'], a: 1 },
  { q: 'A fixed deposit of ₹2,50,000 earns 7.2% simple interest per annum. What is the interest after 8 months?', o: ['₹12,000', '₹14,400', '₹18,000', '₹10,800'], a: 0 },
  { q: 'A loan EMI is ₹18,500. If 22% of it is interest, what is the principal component?', o: ['₹13,530', '₹14,430', '₹15,170', '₹12,950'], a: 1 },
  { q: 'A branch’s CASA balance fell from ₹4.8 crore to ₹4.32 crore. What is the percentage decline?', o: ['8%', '10%', '12%', '15%'], a: 1 },
  { q: 'If 3 tellers process 180 cheques in 2 hours, how many will 5 tellers process in 3 hours at the same rate?', o: ['400', '450', '480', '540'], a: 1 },
  { q: 'A customer deposits ₹15,000 monthly for 2 years at 0% interest. What is the corpus?', o: ['₹3,00,000', '₹3,60,000', '₹1,80,000', '₹4,20,000'], a: 1 },
  { q: 'A portfolio of ₹12 lakh grows 15% then falls 15%. What is the final value?', o: ['₹12,00,000', '₹11,73,000', '₹11,97,000', '₹12,27,000'], a: 1 },
  { q: 'Of 850 accounts, 34% are dormant. If 68 are reactivated, what percentage remains dormant?', o: ['18%', '21%', '24%', '26%'], a: 1 },
];

const ANALYTICAL = [
  { q: 'All premium customers get a relationship manager. Priya has a relationship manager. Which conclusion follows?', o: ['Priya is a premium customer', 'Priya may or may not be a premium customer', 'Priya is not a premium customer', 'No conclusion is possible'], a: 1 },
  { q: 'A branch is open Monday to Saturday. Audits happen on the 2nd working day of each week. In a week where Monday is a holiday, when is the audit?', o: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], a: 2 },
  { q: 'Four branches rank by deposits: A > B, C > A, D < B. Which branch has the highest deposits?', o: ['A', 'B', 'C', 'D'], a: 2 },
  { q: 'If every loan above ₹50 lakh needs two approvals, and this loan has one approval, what can you conclude?', o: ['The loan is below ₹50 lakh', 'The loan is not yet fully approved', 'The loan was rejected', 'Nothing can be concluded'], a: 1 },
  { q: 'A queue system serves priority customers first. If 3 priority and 7 regular customers arrive together, what position is the first regular customer?', o: ['1st', '3rd', '4th', '7th'], a: 2 },
  { q: 'Statement: "Only verified accounts can transact." Which is necessarily true?', o: ['All verified accounts transact', 'An account that transacts is verified', 'Unverified accounts sometimes transact', 'Verification guarantees transaction'], a: 1 },
  { q: 'Sales fell in Q2 and rose in Q3 to a level below Q1. Which is true of Q3 versus Q2?', o: ['Q3 is lower than Q2', 'Q3 is higher than Q2', 'Q3 equals Q2', 'Cannot be determined'], a: 1 },
  { q: 'A cheque clears in 2 working days. Deposited Thursday, with Saturday and Sunday non-working — when does it clear?', o: ['Friday', 'Saturday', 'Monday', 'Tuesday'], a: 2 },
];

const DIFFICULTY = ['easy', 'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'difficult'] as const;

const SPEECHX_PROMPTS: Record<string, string[]> = {
  Pronunciation: ['Read aloud: "The branch manager authorised the withdrawal immediately."', 'Read aloud: "Please verify your registered mobile number."'],
  Fluency: ['Describe, in 60 seconds, how you would explain a fixed deposit to a first-time customer.', 'Speak for 60 seconds about a time you resolved a difficult customer complaint.'],
  Grammar: ['Choose the correct sentence.', 'Select the grammatically correct option.'],
  'Listening Comprehension': ['Listen to the customer call and answer: what did the customer request?', 'Listen to the announcement and answer: which document is required?'],
};

const SJT_SCENARIOS = [
  'A customer is angry that their loan was declined and raises their voice in the branch lobby. What do you do first?',
  'You are close to your monthly target and a customer asks about a product that does not suit their needs. What do you do?',
  'A colleague asks you to cover an obvious documentation gap for a large account. How do you respond?',
  'A long-standing customer requests a fee waiver you cannot authorise. How do you handle it?',
];

const SJT_OPTIONS = [
  'Escalate immediately to the branch manager without speaking to the customer',
  'Listen fully, acknowledge the concern, then explain the next step calmly',
  'Explain the policy firmly and end the conversation',
  'Offer whatever the customer asks for to defuse the situation',
];

const LIKERT = [
  'I stay calm when a customer becomes confrontational.',
  'I prefer to finish what I start, even under pressure.',
  'I find it easy to approach people I do not know.',
  'I look for extra work when my own tasks are done.',
  'I recover quickly after a difficult day.',
];

// ── seeding ─────────────────────────────────────────────────────────────────

export const seed = (db: DB): void => {
  const has = db.prepare(`SELECT COUNT(*) AS n FROM tmext_ai_competency_framework`).get() as { n: number };
  if (has.n > 0) {
    console.log('Database already seeded — skipping.');
    return;
  }

  const tx = db.transaction(() => {
    // roles (ATS stand-in)
    const jobs: [number, string][] = [
      [101, 'Retail Officer'],
      [102, 'Branch Manager'],
      [103, 'Campus Graduate'],
      [104, 'Sales Officer'],
    ];
    for (const [id, name] of jobs) {
      db.prepare(`INSERT INTO tmext_job (role_id, role_name) VALUES (?, ?)`).run(id, name);
    }

    // global settings (docs/05 §6.3)
    db.prepare(
      `INSERT INTO tmext_ai_assessment_settings
         (id, role_id, cooling_period_pass_days, cooling_period_fail_days, max_attempts,
          score_policy, session_ttl_minutes, recording_retention_days,
          id_image_retention_days, answer_retention_days, result_visibility, updated_by, updated_at)
       VALUES ('settings-global', NULL, 180, 90, 2, 'best', 240, 90, 30, 730, 'basic', 'system', ?)`,
    ).run(now);

    // requirements (docs/05 §2)
    const reqs: [number, string, string | null, number][] = [
      [101, 'Retail Officer', 'lateral', 1],
      [101, 'Retail Officer', 'campus', 0],
      [102, 'Branch Manager', 'lateral', 1],
      [103, 'Campus Graduate', 'campus', 0],
      [104, 'Sales Officer', null, 1], // wildcard — all program types
    ];
    for (const [roleId, roleName, program, required] of reqs) {
      db.prepare(
        `INSERT INTO tmext_ai_assessment_requirements
           (id, role_id, role_name, program_type, required, created_by, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'system', 0, ?, ?)`,
      ).run(uuid(), roleId, roleName, program, required, now, now);
    }

    // framework
    const frameworkId = uuid();
    db.prepare(
      `INSERT INTO tmext_ai_competency_framework (id, name, version, status, created_by, is_deleted, created_at, updated_at)
       VALUES (?, 'Axis Hiring Competencies', 1, 'published', 'system', 0, ?, ?)`,
    ).run(frameworkId, now, now);

    const competencyIds = new Map<string, string>();
    let metaOrder = 0;

    for (const meta of FRAMEWORK) {
      const metaId = uuid();
      db.prepare(
        `INSERT INTO tmext_ai_meta_competency (id, framework_id, name, display_order, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      ).run(metaId, frameworkId, meta.name, metaOrder++, now, now);

      let compOrder = 0;
      for (const c of meta.competencies) {
        const compId = uuid();
        competencyIds.set(c.name, compId);
        db.prepare(
          `INSERT INTO tmext_ai_competency
             (id, meta_competency_id, parent_competency_id, name, definition,
              behavioral_indicators, display_order, is_deleted, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, ?)`,
        ).run(compId, metaId, c.name, c.definition, JSON.stringify(c.indicators), compOrder++, now, now);

        for (const sub of c.subs ?? []) {
          db.prepare(
            `INSERT INTO tmext_ai_competency
               (id, meta_competency_id, parent_competency_id, name, definition,
                behavioral_indicators, display_order, is_deleted, created_at, updated_at)
             VALUES (?, ?, ?, ?, '', '[]', 0, 0, ?, ?)`,
          ).run(uuid(), metaId, compId, sub, now, now);
        }
      }
    }

    // blueprint
    const blueprintId = uuid();
    const totalMinutes = FRAMEWORK.flatMap((m) => m.competencies).reduce(
      (sum, c) => sum + (c.minutes ?? 0),
      0,
    );
    db.prepare(
      `INSERT INTO tmext_ai_blueprint
         (id, framework_id, name, role_id, program_type, version, status,
          total_duration_minutes, overall_cutoff, source_file, created_by, is_deleted, created_at, updated_at)
       VALUES (?, ?, 'Retail Officer Blueprint', 101, 'lateral', 1, 'published', ?, 60,
               'Mercer Mettl_Blueprint_Sample2.xlsx + SampleAssessment_Blueprint.xlsx', 'system', 0, ?, ?)`,
    ).run(blueprintId, frameworkId, totalMinutes, now, now);

    const sectionIds = new Map<string, string>();
    let secOrder = 0;
    for (const meta of FRAMEWORK) {
      for (const c of meta.competencies) {
        const sectionId = uuid();
        sectionIds.set(c.name, sectionId);
        db.prepare(
          `INSERT INTO tmext_ai_blueprint_section
             (id, blueprint_id, competency_id, tool, selection_rule, duration_minutes,
              cutoff_score, weight, display_order, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?)`,
        ).run(
          sectionId,
          blueprintId,
          competencyIds.get(c.name)!,
          c.tool,
          JSON.stringify(c.rule),
          c.minutes,
          c.cutoff,
          secOrder++,
          now,
          now,
        );
      }
    }

    // questions
    const insertQ = db.prepare(
      `INSERT INTO tmext_ai_question
         (id, competency_id, tool, question_type, difficulty, body, media, options, answer_key,
          marks_correct, marks_wrong, marks_partial, expected_time_sec, status, usage_count,
          created_by, is_deleted, created_at, updated_at)
       VALUES (@id, @competency_id, @tool, @question_type, @difficulty, @body, NULL, @options,
               @answer_key, @marks_correct, 0, 0, @expected_time_sec, 'approved', 0, 'system', 0, @now, @now)`,
    );

    const questionsBySection = new Map<string, string[]>();
    const addQ = (competency: string, q: Record<string, unknown>) => {
      const id = uuid();
      insertQ.run({ id, competency_id: competencyIds.get(competency)!, now, ...q });
      const sec = sectionIds.get(competency)!;
      const list = questionsBySection.get(sec) ?? [];
      list.push(id);
      questionsBySection.set(sec, list);
      return id;
    };

    const mcq = (competency: string, bank: typeof NUMERICAL, tool: string) => {
      bank.forEach((item, i) => {
        addQ(competency, {
          tool,
          question_type: 'MCQ_SINGLE',
          difficulty: DIFFICULTY[i] ?? 'medium',
          body: item.q,
          options: JSON.stringify(item.o.map((text, idx) => ({ id: `o${idx}`, text }))),
          answer_key: JSON.stringify(`o${item.a}`),
          marks_correct: 1,
          expected_time_sec: 75,
        });
      });
    };

    mcq('Analytical Ability and Problem Solving', ANALYTICAL, 'MCQ');
    mcq('Numerical Ability', NUMERICAL, 'MCQ');

    addQ('Writing Skills', {
      tool: 'WRITING',
      question_type: 'LONG_TEXT',
      difficulty: 'medium',
      body:
        'A customer has written to complain that their salary account was debited with a fee they did not expect. ' +
        'Write a reply of 150–200 words: acknowledge the concern, explain what you will do, and set expectations for a resolution.',
      options: null,
      answer_key: null, // AI-scored against the blueprint's four behavioural indicators
      marks_correct: 20,
      expected_time_sec: 900,
    });

    // SpeechX — seeded at the row sum (64), per the competency rows.
    const speechCounts: [string, number][] = [
      ['Pronunciation', 10],
      ['Fluency', 4],
      ['Grammar', 34],
      ['Listening Comprehension', 16],
    ];
    for (const [competency, count] of speechCounts) {
      const prompts = SPEECHX_PROMPTS[competency] ?? ['Respond to the prompt.'];
      for (let i = 0; i < count; i++) {
        const isGrammar = competency === 'Grammar';
        addQ(competency, {
          tool: 'SPEECHX',
          question_type: isGrammar ? 'MCQ_SINGLE' : 'AUDIO_RESPONSE',
          difficulty: null,
          body: `${prompts[i % prompts.length]} (item ${i + 1} of ${count})`,
          options: isGrammar
            ? JSON.stringify([
                { id: 'o0', text: 'The customer have submitted their documents.' },
                { id: 'o1', text: 'The customer has submitted their documents.' },
                { id: 'o2', text: 'The customer having submitted their documents.' },
                { id: 'o3', text: 'The customer submitted has their documents.' },
              ])
            : null,
          answer_key: isGrammar ? JSON.stringify('o1') : null,
          marks_correct: 1,
          expected_time_sec: isGrammar ? 30 : 75,
        });
      }
    }

    // Sales Personality — MPM Likert + SJT scenarios
    for (let i = 0; i < 20; i++) {
      addQ('Self-Management', {
        tool: 'MPM',
        question_type: 'LIKERT',
        difficulty: null,
        body: LIKERT[i % LIKERT.length]!,
        options: JSON.stringify(
          ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'].map((t, idx) => ({
            id: `o${idx}`,
            text: t,
          })),
        ),
        answer_key: null, // norm-referenced, never keyed right/wrong
        marks_correct: 0,
        expected_time_sec: 20,
      });
    }

    for (const [competency, count] of [
      ['Managing the Sales Process', 12],
      ['Managing the Customer Relationship', 10],
    ] as [string, number][]) {
      for (let i = 0; i < count; i++) {
        addQ(competency, {
          tool: 'SJT',
          question_type: 'SJT',
          difficulty: null,
          body: `${SJT_SCENARIOS[i % SJT_SCENARIOS.length]} (scenario ${i + 1})`,
          options: JSON.stringify(SJT_OPTIONS.map((text, idx) => ({ id: `o${idx}`, text }))),
          answer_key: JSON.stringify('o1'), // keyed by effectiveness ranking
          marks_correct: 1,
          expected_time_sec: 45,
        });
      }
    }

    // live test instantiating the blueprint
    const testId = uuid();
    db.prepare(
      `INSERT INTO tmext_ai_test
         (id, blueprint_id, name, role_id, program_type, status, opens_at, closes_at,
          duration_minutes, overall_cutoff, enforce_section_cutoffs, negative_marking,
          allow_retake, max_attempts, cooldown_hours, score_policy, proctoring,
          created_by, is_deleted, created_at, updated_at)
       VALUES (?, ?, 'Retail Officer — Lateral Q3', 101, 'lateral', 'live', ?, ?,
               ?, 60, 1, 0, 1, 2, 24, 'best', ?, 'system', 0, ?, ?)`,
    ).run(
      testId,
      blueprintId,
      now,
      new Date(Date.now() + 30 * 86_400_000).toISOString(),
      totalMinutes,
      JSON.stringify({
        enabled: true,
        checks: {
          face_match_login: true,
          continuous_face: true,
          multi_face: true,
          tab_switch: true,
          copy_paste_block: true,
          fullscreen_enforce: true,
          second_device: false,
        },
        warning_limit: 3,
        // docs/03 §2.2 — recommended default: review afterwards rather than
        // interrupt an honest candidate mid-test.
        on_limit: 'lock_and_notify',
        recording_retention_days: 90,
      }),
      now,
      now,
    );

    let order = 0;
    for (const [sectionId, ids] of questionsBySection) {
      for (const qid of ids) {
        db.prepare(
          `INSERT INTO tmext_ai_test_question (id, test_id, section_id, question_id, display_order)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(uuid(), testId, sectionId, qid, order++);
      }
    }

    console.log(`Seeded framework, blueprint (${totalMinutes} min), ${order} questions, 1 live test.`);
  });

  tx();
};

// Run directly: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  setDb(db);
  seed(db);
  console.log('Seed complete.');
}
