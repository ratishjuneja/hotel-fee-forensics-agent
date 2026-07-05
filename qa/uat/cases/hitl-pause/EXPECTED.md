# Expected outcome — HUMAN-IN-THE-LOOP pause (SYNTHETIC)

**Upload:** `Cedarcliff_HMA_SYNTHETIC.txt` (HMA) + `Cedarcliff_June_statement_HITL_SYNTHETIC.csv`
(Operating Statement). **Do NOT upload a Collated-Invoices / support pack** — its
absence is what makes the agent pause.

**Purpose:** exercise the human-in-the-loop answer form. The golden leakage case
never pauses, so this case is engineered to.

**Why it pauses (deterministic trigger):**
- Same clean statement as the CLEAN case **plus** a `Centralized Services` charge of **$25,000**.
- $25,000 > the HMA **§5.1 $10,000** approval threshold → flagged as a pass-through charge.
- With **no support pack**, the audit can neither confirm nor dismiss the charge, so
  it raises a `human_review` finding → a cited **PendingQuestion** → the run
  **pauses** (`awaiting_input`, HTTP 202) instead of finishing.

**Expected live result — first run:** HTTP 202 `awaiting_input` · 1 pending question:
> *"Did the owner authorize the Centralized Services charge of $25,000? The audit
> found no supporting approval on file, so it cannot decide this alone."*
> options: **authorized** / **not_authorized**

**After answering "No — there is no approval on file" (not_authorized):** the run
replays and **completes** (HTTP 200) · 1 finding, $25,000, resolved to *request
explanation* · a **HUMAN** trace step "Apply owner instructions" appears · confidence 61%.

**After answering "Yes — the owner authorized this charge" (authorized):** the
finding is approved and excluded from the dispute total.

Both option ids and the question id are deterministic
(`<caseId>_q_improper_pass_through`), so the run resolves the same way every replay.
