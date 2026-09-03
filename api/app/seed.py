"""
Seed from the three supplied blueprint spreadsheets.

Competency names, definitions and behavioural indicators are transcribed from:
  - Copy of Mercer Mettl_Blueprint_Sample2.xlsx  (Cognitive + Writing + SpeechX)
  - Copy of Mercer Mettl_Blueprint_Sample3.xlsx  (SpeechX standalone)
  - SampleAssessment_Blueprint.xlsx              (Sales Personality — MPM + SJT)

SpeechX is seeded at the row sum (64 questions), not the sheet header's 72.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import timedelta
from typing import Any

from .db import connect, one, set_db, uuid
from .timeutil import now_iso, parse

FRAMEWORK: list[dict[str, Any]] = [
    {"meta": "Cognitive Ability", "competencies": [
        {"name": "Analytical Ability and Problem Solving",
         "definition": "Demonstrating the ability to analyse the given information from different perspectives by breaking it down into simple components and by structuring the information in a logical order to arrive at a solution.",
         "indicators": [
             "Has a strong ability to differentiate between relevant and irrelevant information",
             "Can logically structure the relevant information points in systematic order",
             "Can analyse the relationship between different information points to deduce a logical conclusion",
             "Has an ability to validate the solution against the information given"],
         "tool": "MCQ", "minutes": 10, "cutoff": 8,
         "rule": {"type": "difficulty_split", "counts": {"easy": 4, "medium": 3, "difficult": 1}, "randomize": True}},
        {"name": "Numerical Ability",
         "definition": "Demonstrating the ability to perceive and process numbers and related symbols to perform basic arithmetic operations.",
         "indicators": [
             "Is able to perform basic arithmetic operations",
             "Has the ability to solve simple problems in work scenario requiring one to work with numbers",
             "Has numeric proficiency, accuracy and speed in doing calculations"],
         "tool": "MCQ", "minutes": 10, "cutoff": 8,
         "rule": {"type": "difficulty_split", "counts": {"easy": 4, "medium": 3, "difficult": 1}, "randomize": True}},
    ]},
    {"meta": "Written English", "competencies": [
        {"name": "Writing Skills",
         "definition": "Demonstrating the ability to communicate via the written text and express ideas and thoughts effectively. It refers to the ability to write meaningful sentences which convey the message with clarity.",
         "indicators": [
             "Expresses thoughts effectively in a clear and concise manner",
             "Is able to use correct grammar, spellings and punctuation in writing",
             "Is able to use rich vocabulary, while keeping the text simple to understand",
             "Is able to present written text in an easy to read manner"],
         "tool": "WRITING", "minutes": 15, "cutoff": 10,
         "rule": {"type": "difficulty_split", "counts": {"easy": 0, "medium": 1, "difficult": 0}, "randomize": False}},
    ]},
    {"meta": "SpeechX Competencies", "competencies": [
        {"name": "Pronunciation",
         "definition": "Demonstrating the ablility to pronounce words correctly for the other person to comprehend the message being delivered.",
         "indicators": ["Speaks in an accepted standard of the sound and stress patterns of a syllable, word, phrase, etc.",
                        "Is able to send across a message without changing the meaning"],
         "tool": "SPEECHX", "minutes": 10, "cutoff": None,
         "rule": {"type": "fixed_count", "count": 10, "randomize": False}},
        {"name": "Fluency",
         "definition": "Demonstrating the ability to express thoughts and ideas comfortably and smoothly in the English language.",
         "indicators": ["Is able to communicate and express thoughts effectively",
                        "Is fluent while speaking in terms of the rate of speech, pauses, and addition of fillers"],
         "tool": "SPEECHX", "minutes": 10, "cutoff": None,
         "rule": {"type": "fixed_count", "count": 4, "randomize": False}},
        {"name": "Grammar",
         "definition": "Demonstrating the ability to write grammatically correct sentences by formulating simple sentences which conveys the message clearly.",
         "indicators": ["Has a basic understanding of words and understands the differences between nouns, pronouns, etc.",
                        "Knows the rules of grammar and is able to communicate effectively"],
         "tool": "SPEECHX", "minutes": 15, "cutoff": None,
         "rule": {"type": "fixed_count", "count": 34, "randomize": False}},
        {"name": "Listening Comprehension",
         "definition": "Demonstrating the ability to attentively listen, receive and effectively understand what other people say, in a communication process.",
         "indicators": ["Is good in comprehending information quickly and accurately while communicating with customers and clients",
                        "Gains information/facts correctly from customers and clients during conversations",
                        "Is able to help in making right decisions"],
         "tool": "SPEECHX", "minutes": 10, "cutoff": None,
         "rule": {"type": "fixed_count", "count": 16, "randomize": False}},
    ]},
    {"meta": "Self-Management", "competencies": [
        {"name": "Self-Management",
         "definition": "Managing one's own emotions, confidence and resilience in a sales context.",
         "indicators": ["Remains calm and composed while dealing with team members and customers under challenging circumstances",
                        "Exhibits a high level of confidence in one's own ability",
                        "Stays optimistic in adverse or demanding situations"],
         "tool": "MPM", "minutes": 8, "cutoff": None,
         "subs": ["Self-control", "Self-confidence", "Stress Tolerance"],
         "rule": {"type": "instrument", "instrument": "MPM", "instrument_version": "mpm_sales_v2",
                  "sub_competencies": ["Self-control", "Self-confidence", "Stress Tolerance"],
                  "norm_group": "sales_india_2026"}},
    ]},
    {"meta": "Managing the Sales Process", "competencies": [
        {"name": "Managing the Sales Process",
         "definition": "Driving results, initiative, information seeking and problem solving through the sales cycle.",
         "indicators": ["Ensures that one's targets and goals are achieved in an effective manner",
                        "Proactively takes up tasks, without being asked to",
                        "Has the ability to gather information from various sources, as and when required",
                        "Demonstrates the ability to resolve problems and issues by finding effective solutions"],
         "tool": "SJT", "minutes": 10, "cutoff": None,
         "subs": ["Result Orientation", "Taking Initiatives", "Information Seeking", "Problem Solving"],
         "rule": {"type": "instrument", "instrument": "SJT", "instrument_version": "sjt_sales_v1",
                  "sub_competencies": ["Result Orientation", "Taking Initiatives", "Information Seeking", "Problem Solving"]}},
    ]},
    {"meta": "Managing the Customer Relationship", "competencies": [
        {"name": "Managing the Customer Relationship",
         "definition": "Building and sustaining customer relationships through empathy, networking and influence.",
         "indicators": ["Recognizes and understands others' emotions and feelings",
                        "Connects with immediate stakeholders on a regular basis",
                        "Identifies factors that capture people's interest and utilizes the same to convince them",
                        "Has the ability to accurately understand and promptly deliver on customer needs"],
         "tool": "SJT", "minutes": 7, "cutoff": None,
         "subs": ["Empathy", "Networking with People", "Influencing Others", "Customer Service Orientation"],
         "rule": {"type": "instrument", "instrument": "SJT", "instrument_version": "sjt_sales_v1",
                  "sub_competencies": ["Empathy", "Networking with People", "Influencing Others", "Customer Service Orientation"]}},
    ]},
]

NUMERICAL = [
    ("A branch processed 1,240 transactions in March, 18% more than in February. How many were processed in February?", ["1,020", "1,051", "1,102", "1,183"], 1),
    ("A fixed deposit of Rs 2,50,000 earns 7.2% simple interest per annum. What is the interest after 8 months?", ["Rs 12,000", "Rs 14,400", "Rs 18,000", "Rs 10,800"], 0),
    ("A loan EMI is Rs 18,500. If 22% of it is interest, what is the principal component?", ["Rs 13,530", "Rs 14,430", "Rs 15,170", "Rs 12,950"], 1),
    ("A branch's CASA balance fell from Rs 4.8 crore to Rs 4.32 crore. What is the percentage decline?", ["8%", "10%", "12%", "15%"], 1),
    ("If 3 tellers process 180 cheques in 2 hours, how many will 5 tellers process in 3 hours at the same rate?", ["400", "450", "480", "540"], 1),
    ("A customer deposits Rs 15,000 monthly for 2 years at 0% interest. What is the corpus?", ["Rs 3,00,000", "Rs 3,60,000", "Rs 1,80,000", "Rs 4,20,000"], 1),
    ("A portfolio of Rs 12 lakh grows 15% then falls 15%. What is the final value?", ["Rs 12,00,000", "Rs 11,73,000", "Rs 11,97,000", "Rs 12,27,000"], 1),
    ("Of 850 accounts, 34% are dormant. If 68 are reactivated, what percentage remains dormant?", ["18%", "21%", "24%", "26%"], 1),
]

ANALYTICAL = [
    ("All premium customers get a relationship manager. Priya has a relationship manager. Which conclusion follows?", ["Priya is a premium customer", "Priya may or may not be a premium customer", "Priya is not a premium customer", "No conclusion is possible"], 1),
    ("A branch is open Monday to Saturday. Audits happen on the 2nd working day of each week. In a week where Monday is a holiday, when is the audit?", ["Monday", "Tuesday", "Wednesday", "Thursday"], 2),
    ("Four branches rank by deposits: A > B, C > A, D < B. Which branch has the highest deposits?", ["A", "B", "C", "D"], 2),
    ("If every loan above Rs 50 lakh needs two approvals, and this loan has one approval, what can you conclude?", ["The loan is below Rs 50 lakh", "The loan is not yet fully approved", "The loan was rejected", "Nothing can be concluded"], 1),
    ("A queue system serves priority customers first. If 3 priority and 7 regular customers arrive together, what position is the first regular customer?", ["1st", "3rd", "4th", "7th"], 2),
    ("Statement: 'Only verified accounts can transact.' Which is necessarily true?", ["All verified accounts transact", "An account that transacts is verified", "Unverified accounts sometimes transact", "Verification guarantees transaction"], 1),
    ("Sales fell in Q2 and rose in Q3 to a level below Q1. Which is true of Q3 versus Q2?", ["Q3 is lower than Q2", "Q3 is higher than Q2", "Q3 equals Q2", "Cannot be determined"], 1),
    ("A cheque clears in 2 working days. Deposited Thursday, with Saturday and Sunday non-working - when does it clear?", ["Friday", "Saturday", "Monday", "Tuesday"], 2),
]

DIFFICULTY = ["easy", "easy", "easy", "easy", "medium", "medium", "medium", "difficult"]

SPEECHX_PROMPTS = {
    "Pronunciation": ['Read aloud: "The branch manager authorised the withdrawal immediately."',
                      'Read aloud: "Please verify your registered mobile number."'],
    "Fluency": ["Describe, in 60 seconds, how you would explain a fixed deposit to a first-time customer.",
                "Speak for 60 seconds about a time you resolved a difficult customer complaint."],
    "Grammar": ["Choose the correct sentence.", "Select the grammatically correct option."],
    "Listening Comprehension": ["Listen to the customer call and answer: what did the customer request?",
                                "Listen to the announcement and answer: which document is required?"],
}

SJT_SCENARIOS = [
    "A customer is angry that their loan was declined and raises their voice in the branch lobby. What do you do first?",
    "You are close to your monthly target and a customer asks about a product that does not suit their needs. What do you do?",
    "A colleague asks you to cover an obvious documentation gap for a large account. How do you respond?",
    "A long-standing customer requests a fee waiver you cannot authorise. How do you handle it?",
]

SJT_OPTIONS = [
    "Escalate immediately to the branch manager without speaking to the customer",
    "Listen fully, acknowledge the concern, then explain the next step calmly",
    "Explain the policy firmly and end the conversation",
    "Offer whatever the customer asks for to defuse the situation",
]

LIKERT = [
    "I stay calm when a customer becomes confrontational.",
    "I prefer to finish what I start, even under pressure.",
    "I find it easy to approach people I do not know.",
    "I look for extra work when my own tasks are done.",
    "I recover quickly after a difficult day.",
]

GRAMMAR_OPTIONS = [
    "The customer have submitted their documents.",
    "The customer has submitted their documents.",
    "The customer having submitted their documents.",
    "The customer submitted has their documents.",
]


def seed(conn: sqlite3.Connection) -> None:
    if one(conn, "SELECT COUNT(*) AS n FROM tmext_ai_competency_framework")["n"]:  # type: ignore[index]
        print("Database already seeded - skipping.")
        return

    ts = now_iso()
    ex = conn.execute

    for role_id, role_name in [(101, "Retail Officer"), (102, "Branch Manager"),
                               (103, "Campus Graduate"), (104, "Sales Officer")]:
        ex("INSERT INTO tmext_job (role_id, role_name) VALUES (?, ?)", (role_id, role_name))

    ex("""INSERT INTO tmext_ai_assessment_settings
            (id, role_id, cooling_period_pass_days, cooling_period_fail_days, max_attempts,
             score_policy, session_ttl_minutes, recording_retention_days,
             id_image_retention_days, answer_retention_days, result_visibility, updated_by, updated_at)
          VALUES ('settings-global', NULL, 180, 90, 2, 'best', 240, 90, 30, 730, 'basic', 'system', ?)""", (ts,))

    for role_id, role_name, program, required in [
        (101, "Retail Officer", "lateral", 1),
        (101, "Retail Officer", "campus", 0),
        (102, "Branch Manager", "lateral", 1),
        (103, "Campus Graduate", "campus", 0),
        (104, "Sales Officer", None, 1),   # wildcard - all program types
    ]:
        ex("""INSERT INTO tmext_ai_assessment_requirements
                (id, role_id, role_name, program_type, required, created_by, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'system', 0, ?, ?)""",
           (uuid(), role_id, role_name, program, required, ts, ts))

    framework_id = uuid()
    ex("""INSERT INTO tmext_ai_competency_framework
            (id, name, version, status, created_by, is_deleted, created_at, updated_at)
          VALUES (?, 'Axis Hiring Competencies', 1, 'published', 'system', 0, ?, ?)""",
       (framework_id, ts, ts))

    comp_ids: dict[str, str] = {}
    for m_order, meta in enumerate(FRAMEWORK):
        meta_id = uuid()
        ex("""INSERT INTO tmext_ai_meta_competency
                (id, framework_id, name, display_order, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, 0, ?, ?)""", (meta_id, framework_id, meta["meta"], m_order, ts, ts))
        for c_order, c in enumerate(meta["competencies"]):
            cid = uuid()
            comp_ids[c["name"]] = cid
            ex("""INSERT INTO tmext_ai_competency
                    (id, meta_competency_id, parent_competency_id, name, definition,
                     behavioral_indicators, display_order, is_deleted, created_at, updated_at)
                  VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, ?)""",
               (cid, meta_id, c["name"], c["definition"], json.dumps(c["indicators"]), c_order, ts, ts))
            for sub in c.get("subs", []):
                ex("""INSERT INTO tmext_ai_competency
                        (id, meta_competency_id, parent_competency_id, name, definition,
                         behavioral_indicators, display_order, is_deleted, created_at, updated_at)
                      VALUES (?, ?, ?, ?, '', '[]', 0, 0, ?, ?)""", (uuid(), meta_id, cid, sub, ts, ts))

    all_comps = [c for m in FRAMEWORK for c in m["competencies"]]
    total_minutes = sum(c["minutes"] or 0 for c in all_comps)

    blueprint_id = uuid()
    ex("""INSERT INTO tmext_ai_blueprint
            (id, framework_id, name, role_id, program_type, version, status,
             total_duration_minutes, overall_cutoff, source_file, created_by, is_deleted, created_at, updated_at)
          VALUES (?, ?, 'Retail Officer Blueprint', 101, 'lateral', 1, 'published', ?, 60,
                  'Mercer Mettl_Blueprint_Sample2.xlsx + SampleAssessment_Blueprint.xlsx', 'system', 0, ?, ?)""",
       (blueprint_id, framework_id, total_minutes, ts, ts))

    section_ids: dict[str, str] = {}
    for order, c in enumerate(all_comps):
        sid = uuid()
        section_ids[c["name"]] = sid
        ex("""INSERT INTO tmext_ai_blueprint_section
                (id, blueprint_id, competency_id, tool, selection_rule, duration_minutes,
                 cutoff_score, weight, display_order, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?)""",
           (sid, blueprint_id, comp_ids[c["name"]], c["tool"], json.dumps(c["rule"]),
            c["minutes"], c["cutoff"], order, ts, ts))

    by_section: dict[str, list[str]] = {}

    def add_q(competency: str, **kw: Any) -> None:
        qid = uuid()
        ex("""INSERT INTO tmext_ai_question
                (id, competency_id, tool, question_type, difficulty, body, media, options, answer_key,
                 marks_correct, marks_wrong, marks_partial, expected_time_sec, status, usage_count,
                 created_by, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, 0, ?, 'approved', 0, 'system', 0, ?, ?)""",
           (qid, comp_ids[competency], kw["tool"], kw["question_type"], kw.get("difficulty"),
            kw["body"], kw.get("options"), kw.get("answer_key"), kw.get("marks_correct", 1),
            kw.get("expected_time_sec", 60), ts, ts))
        by_section.setdefault(section_ids[competency], []).append(qid)

    for competency, bank in [("Analytical Ability and Problem Solving", ANALYTICAL),
                             ("Numerical Ability", NUMERICAL)]:
        for i, (body, options, answer) in enumerate(bank):
            add_q(competency, tool="MCQ", question_type="MCQ_SINGLE", difficulty=DIFFICULTY[i],
                  body=body,
                  options=json.dumps([{"id": f"o{j}", "text": t} for j, t in enumerate(options)]),
                  answer_key=json.dumps(f"o{answer}"), marks_correct=1, expected_time_sec=75)

    add_q("Writing Skills", tool="WRITING", question_type="LONG_TEXT", difficulty="medium",
          body=("A customer has written to complain that their salary account was debited with a fee "
                "they did not expect. Write a reply of 150-200 words: acknowledge the concern, explain "
                "what you will do, and set expectations for a resolution."),
          options=None,
          answer_key=None,  # AI-scored against the blueprint's four behavioural indicators
          marks_correct=20, expected_time_sec=900)

    for competency, count in [("Pronunciation", 10), ("Fluency", 4),
                              ("Grammar", 34), ("Listening Comprehension", 16)]:
        prompts = SPEECHX_PROMPTS[competency]
        for i in range(count):
            is_grammar = competency == "Grammar"
            add_q(competency, tool="SPEECHX",
                  question_type="MCQ_SINGLE" if is_grammar else "AUDIO_RESPONSE",
                  body=f"{prompts[i % len(prompts)]} (item {i + 1} of {count})",
                  options=json.dumps([{"id": f"o{j}", "text": t} for j, t in enumerate(GRAMMAR_OPTIONS)]) if is_grammar else None,
                  answer_key=json.dumps("o1") if is_grammar else None,
                  marks_correct=1, expected_time_sec=30 if is_grammar else 75)

    for i in range(20):
        add_q("Self-Management", tool="MPM", question_type="LIKERT", body=LIKERT[i % len(LIKERT)],
              options=json.dumps([{"id": f"o{j}", "text": t} for j, t in enumerate(
                  ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"])]),
              answer_key=None,  # norm-referenced, never keyed right/wrong
              marks_correct=0, expected_time_sec=20)

    for competency, count in [("Managing the Sales Process", 12),
                              ("Managing the Customer Relationship", 10)]:
        for i in range(count):
            add_q(competency, tool="SJT", question_type="SJT",
                  body=f"{SJT_SCENARIOS[i % len(SJT_SCENARIOS)]} (scenario {i + 1})",
                  options=json.dumps([{"id": f"o{j}", "text": t} for j, t in enumerate(SJT_OPTIONS)]),
                  answer_key=json.dumps("o1"),  # keyed by effectiveness ranking
                  marks_correct=1, expected_time_sec=45)

    test_id = uuid()
    closes = (parse(ts) + timedelta(days=30)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    ex("""INSERT INTO tmext_ai_test
            (id, blueprint_id, name, role_id, program_type, status, opens_at, closes_at,
             duration_minutes, overall_cutoff, enforce_section_cutoffs, negative_marking,
             allow_retake, max_attempts, cooldown_hours, score_policy, proctoring,
             created_by, is_deleted, created_at, updated_at)
          VALUES (?, ?, 'Retail Officer - Lateral Q3', 101, 'lateral', 'live', ?, ?,
                  ?, 60, 1, 0, 1, 2, 24, 'best', ?, 'system', 0, ?, ?)""",
       (test_id, blueprint_id, ts, closes, total_minutes,
        json.dumps({
            "enabled": True,
            "checks": {"face_match_login": True, "continuous_face": True, "multi_face": True,
                       "tab_switch": True, "copy_paste_block": True, "fullscreen_enforce": True,
                       "second_device": False},
            "warning_limit": 3,
            # docs/03 §2.2 - recommended default: review afterwards rather than
            # interrupt an honest candidate mid-test.
            "on_limit": "lock_and_notify",
            "recording_retention_days": 90,
        }), ts, ts))

    order = 0
    for sid, qids in by_section.items():
        for qid in qids:
            ex("""INSERT INTO tmext_ai_test_question
                    (id, test_id, section_id, question_id, display_order)
                  VALUES (?, ?, ?, ?, ?)""", (uuid(), test_id, sid, qid, order))
            order += 1

    conn.commit()
    print(f"Seeded framework, blueprint ({total_minutes} min), {order} questions, 1 live test.")


if __name__ == "__main__":
    c = connect()
    set_db(c)
    seed(c)
    print("Seed complete.")
