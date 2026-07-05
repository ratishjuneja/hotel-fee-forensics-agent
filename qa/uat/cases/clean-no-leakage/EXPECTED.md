# Expected outcome — CLEAN, no leakage (SYNTHETIC)

**Upload:** `Cedarcliff_HMA_SYNTHETIC.txt` (HMA) + `Cedarcliff_June_statement_CLEAN_SYNTHETIC.csv` (Operating Statement). Nothing else.

**Purpose:** prove the agent does **not** invent findings — every fee is charged
correctly, so the audit must return zero leakage and show an honest no-leakage state.

**Hand math (deterministic result BEFORE running):**
- Total Operating Revenue = 1,000,000 + 300,000 + 50,000 + 50,000 = **$1,400,000**
- Expected base fee = 3.0% × 1,400,000 = **$42,000** — charged **$42,000** → Δ 0
- GOP = 1,400,000 − (480,000 dept + 220,000 undistributed) = **$700,000**
- Expected incentive = 10% × 700,000 = **$70,000** — charged **$70,000** → Δ 0
- No §4.3-excluded revenue in the base; no pass-through/centralized charge.
- Charged total $112,000 = expected $112,000 → **variance $0**

**Expected live result:** HTTP 200 `completed` · **0 findings** · suspected
overcharge **$0** · variance **$0** · confidence **73%** · trace 2 LLM + 6 TOOL ·
memo header reads **"No fee issues identified"**. The run does **not** pause.

**Watch for (known UX gap, see FINDINGS.md):** the report's **Findings** section
renders empty with no "no leakage found" line, and "Build dispute packet" still
shows "0 of 0 findings". The $0 numbers and the memo's "No fee issues identified"
are the honest signals; the empty Findings block is a polish gap, not a failure.
