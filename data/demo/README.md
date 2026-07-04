# Demo case — The Harborline Hotel (SYNTHETIC)

> ⚠️ **All documents in this folder are fictional and synthetic.** Names, parties,
> clauses, and every dollar figure are invented for demonstration. Nothing here is a
> real hotel management agreement, real customer data, or a proprietary asset. Clause
> wording is *modeled on* the structure of publicly filed HMAs (SEC EDGAR exhibits)
> but is original to this project.

One synthetic hotel case that drives the end-to-end demo: audit month **June**,
prior month **May**, property **The Harborline Hotel** (Owner: Cascadia Hotel Owner
LP; Operator: Meridian Hotel Management LLC).

## Files

| File | What it is | Maps to Product/Data task |
|---|---|---|
| `01_HMA_excerpt.txt` | Hotel Management Agreement excerpt — fee clauses (Art. 4 fees + exclusions, Art. 5 centralized services + approval threshold, Art. 9 audit rights) | Synthetic HMA |
| `02_operating_statement_june.csv` | USALI-format June operating statement / P&L (revenue → GOP → fees charged) | Current-month operating statement + P&L |
| `02b_misc_income_breakout_june.csv` | June Miscellaneous Income schedule; flags the excluded items (banquet cancellation, insurance proceeds) | Revenue schedule |
| `03_operating_statement_may.csv` | Clean prior-month (May) statement — the anomaly baseline | Prior-month statement |
| `04_support_invoice_pack.csv` | Invoice/approval pack; the missing owner approval (`APPROVAL-0612-03`) is what Check 5 catches | Support pack (for the re-retrieval loop) |
| `05_expected_answer.md` | Hand-authored ground-truth key: 3 findings, math, confidence, demo narration | Expected answer |

## Ground truth (see `05_expected_answer.md` for the full key)

Total identified fee issues **$36,580** = $8,580 hard overcharge (F1 $1,980 + F2 $6,600)
+ $28,000 unsupported pending approval (F3). Demo confidence renders as **96**.

The three findings exercise all three MVP leakage scenarios:
1. **F1** — excluded revenue (insurance + cancellation, $66k) left in the base-fee base → **$1,980**.
2. **F2** — incentive fee on inflated GOP (same $66k not backed out) → **$6,600**.
3. **F3** — centralized services $28k charged without the required owner approval → **$28,000** unsupported. May→June anomaly (+273%) triggers the re-retrieval loop that finds the missing approval.

## ⚠️ Downstream mismatch to reconcile

These figures are the *authored* ground truth. The backend demo mock and the fee
calculator currently target an older set of numbers (**$18,750** total, confidence
**86%**, findings $6,000 / $9,750 / $3,000 against HMA §4.1(b)/§4.2/§6.3). The frontend
`ConfidenceMeter` is hard-coded to 86%. Backend mock/calculator and the frontend static
confidence need to be updated to match this case ($36,580 / 96%) before the demo, or the
UI will show numbers that don't reconcile with these documents. See `docs/tracker.md` §4.
