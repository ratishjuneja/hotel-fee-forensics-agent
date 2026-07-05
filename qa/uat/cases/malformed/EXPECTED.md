# Expected outcome — MALFORMED input (SYNTHETIC)

**Purpose:** prove bad input is honestly rejected — nothing is analysed or
fabricated. Three variants, three honest failures.

## a. Corrupt / binary export — `corrupt_export_SYNTHETIC.csv`
Upload the corrupt file in the **Operating Statement** slot (any valid HMA).
- **Expected:** `POST /api/cases` → 202 (case created), then the async parse job
  flips the case to status **`failed`** with warning
  *"File is not a readable CSV (binary/PDF content). Upload a .csv export."*
- **UI:** the parsing screen shows **Failed** and lists the warning; nothing is
  analysed. This is the clean, intended rejection.

## b. Wrong-columns / truncated CSV — `wrong_columns_SYNTHETIC.csv`
Upload in the **Operating Statement** slot.
- **Expected (actual, verified):** parse status **`ready`** (the file decodes as
  text), then `POST .../run-audit` → **HTTP 500** `internal_error`. The run page
  shows *"The audit could not run."* Nothing is fabricated.
- ⚠️ **Known bug (see FINDINGS.md):** a structurally-invalid statement (missing the
  `line_item` / `amount` columns) is not caught at parse time; it 500s at run time
  instead of returning a clean `failed` status or a 422. Honest, but ungraceful.

## c. Missing required document (procedure — no file)
Upload **only** the HMA; leave the Operating Statement empty.
- **Expected:** `POST /api/cases` → **HTTP 400** `missing_required_document`
  ("Both an HMA and an operating statement are required.").
- **UI:** the **Upload** button stays **disabled** until both required documents
  are attached, so a tester cannot submit an incomplete case.
