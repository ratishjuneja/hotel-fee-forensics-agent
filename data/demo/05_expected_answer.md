# Expected Answer — Ground Truth Key

This is the hand-authored correct answer the agent's output is tested against. Every
number here is verified to foot against the synthetic statements. Use it to (a) validate
the agent produces the right findings, and (b) script the demo narration.

Property: The Harborline Hotel | Audit month: June | Prior month: May

--------------------------------------------------------------------------------
HEADLINE
--------------------------------------------------------------------------------
Total identified fee issues: $36,580
  - Hard overcharges (Findings 1 + 2): $8,580
  - Unsupported pending approval (Finding 3): $28,000
Fees charged by operator in June: $276,200

--------------------------------------------------------------------------------
FINDING 1 — Excluded revenue included in base fee
--------------------------------------------------------------------------------
Detected by:  Check 2 (Inclusion)
Contract rule: HMA 4.3(a) and 4.3(c) exclude insurance proceeds and cancellation
               revenue from the fee base.
Evidence:      Misc Income breakout — Banquet Cancellation 41,000 + Insurance
               Proceeds 25,000 = 66,000 wrongly left in Total Operating Revenue.
Math:
   Charged  = 3.0% x Total Operating Revenue 3,540,000        = 106,200
   Correct  = 3.0% x (3,540,000 - 66,000 = 3,474,000)         = 104,220
   OVERCHARGE                                                  =   1,980
Classification: overcharge
Confidence: HIGH (clause explicit, all data present, math reconciles, evidence in breakout)

--------------------------------------------------------------------------------
FINDING 2 — Incentive fee calculated on wrong / overstated base
--------------------------------------------------------------------------------
Detected by:  Check 3 (GOP/AGOP)
Contract rule: HMA 4.2 — incentive = 10% of GOP, GOP defined per USALI, excludes
               excluded-revenue items and is NOT Total Operating Revenue.
Evidence:      Operator charged 142,000. True GOP, once the 66,000 excluded revenue
               is removed, is 1,354,000 (reported GOP 1,420,000 - 66,000).
Math:
   Charged  = 142,000  (operator used the inflated/reported GOP base)
   Correct  = 10% x true GOP 1,354,000                        = 135,400
   OVERCHARGE                                                  =   6,600
Classification: overcharge
Confidence: HIGH (GOP definition explicit in 4.2; excluded-rev link traced to 4.3)

--------------------------------------------------------------------------------
FINDING 3 — Centralized services charged without required approval
--------------------------------------------------------------------------------
Detected by:  Check 5 (Reclassification / Approval) + anomaly loop (Check 4)
Contract rule: HMA 5.1 — centralized charge > $10,000/month requires prior written
               owner approval; otherwise unsupported and reversible.
Trigger:       Check 4 flagged the anomaly — May centralized services was 7,500,
               June is 28,000 (+273% on flat revenue). Agent then retrieved the
               support pack (the re-retrieval loop) and found the invoice present
               but APPROVAL-0612-03 MISSING.
Math:
   Charged      = 28,000
   Approved     = 0 (no approval on file)
   UNSUPPORTED  = 28,000
Classification: unsupported (not a hard overcharge — pending approval/reversal)
Confidence: HIGH on "approval missing"; MEDIUM on final disposition (owner may still
            approve retroactively, so recommend reversal-or-approval, not auto-clawback)

--------------------------------------------------------------------------------
CONFIDENCE SCORE — deterministic components (per build spec)
--------------------------------------------------------------------------------
Overall demo confidence should render as a visible SUM, not a vibe:
   Contract clarity        +25  (all three clauses explicit)
   Data completeness       +25  (statement + breakout + prior month all present)
   Calculation match       +20  (agent reproduces all non-flagged fees exactly)
   Evidence support        +16  (F1/F2 fully evidenced; F3 missing approval = partial)
   Prior-month consistency +10  (anomaly confirmed against May)
   = 96  (F3's missing approval is the only deduction from a perfect score)

--------------------------------------------------------------------------------
EXPECTED MEMO STRUCTURE (agent output should match this shape)
--------------------------------------------------------------------------------
Executive Summary: three issues, $8,580 overcharge + $28,000 unsupported, within
   the 12-month audit window (HMA 9.2), true-up available.
Findings Table: the three findings above, each tagged with its detection check.
Calculation Breakdown: the math blocks above.
Citation Trail: F1 -> 4.3 + Misc breakout; F2 -> 4.2 + GOP; F3 -> 5.1 + missing approval.
Recommended Next Action: send dispute notice requesting true-up on Findings 1-2 and
   either approval or reversal on Finding 3, before the audit window closes.

--------------------------------------------------------------------------------
DEMO SHOWCASE ORDER
--------------------------------------------------------------------------------
1. Finding 1 (clean, legible: "they taxed you on money the contract says to exclude")
2. Finding 3 (shows the anomaly -> re-retrieval loop -> missing approval; proves "agent")
3. Finding 2 (the subtle one: wrong profit base; shows domain depth)
