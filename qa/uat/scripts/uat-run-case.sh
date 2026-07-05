#!/usr/bin/env bash
#
# uat-run-case.sh — poll parse status, run the audit, and summarise the result
# for one already-uploaded case. Read-only against the deployment (plus the
# run-audit call it triggers). Requires: curl, jq.
#
#   ./uat-run-case.sh <caseId> [baseUrl]
#
# Upload first, e.g.:
#   curl -s -X POST http://65.20.86.52/api/cases \
#     -F "hma=@qa/uat/cases/clean-no-leakage/Cedarcliff_HMA_SYNTHETIC.txt" \
#     -F "statement=@qa/uat/cases/clean-no-leakage/Cedarcliff_June_statement_CLEAN_SYNTHETIC.csv" \
#     -F "draftEmail=true" | jq -r .caseId
#
set -euo pipefail
CID="${1:?usage: uat-run-case.sh <caseId> [baseUrl]}"
BASE="${2:-http://65.20.86.52}"

echo "--- poll GET /api/cases/$CID ---"
ST=""
for i in $(seq 1 20); do
  ST=$(curl -s "$BASE/api/cases/$CID")
  STATUS=$(echo "$ST" | jq -r '.status')
  echo "  attempt $i: status=$STATUS"
  [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ] && break
  sleep 1.5
done
echo "  parseWarnings: $(echo "$ST" | jq -c '.parseWarnings')"
if [ "$(echo "$ST" | jq -r '.status')" = "failed" ]; then
  echo "PARSE FAILED — honest rejection (nothing analysed)."; exit 0
fi

echo "--- POST /api/cases/$CID/run-audit ---"
RUN=$(curl -s -w $'\n%{http_code}' -X POST "$BASE/api/cases/$CID/run-audit")
CODE=$(echo "$RUN" | tail -1); BODY=$(echo "$RUN" | sed '$d')
echo "  HTTP $CODE  status=$(echo "$BODY" | jq -r '.status')"
echo "  findings=$(echo "$BODY" | jq -r '.findings | length')  suspectedTotal=\$$(echo "$BODY" | jq -r '[.findings[].suspectedImpact] | add // 0')  confidence=$(echo "$BODY" | jq -r '.confidence')"
echo "  trace: $(echo "$BODY" | jq -r '[.trace[]|select(.kind=="LLM")]|length') LLM + $(echo "$BODY" | jq -r '[.trace[]|select(.kind=="TOOL")]|length') TOOL + $(echo "$BODY" | jq -r '[.trace[]|select(.kind=="HUMAN")]|length') HUMAN"
echo "$BODY" | jq -r '.findings[]? | "    finding: \(.title) | $\(.suspectedImpact) | \(.recommendedAction)"'
echo "$BODY" | jq -r '.pendingQuestions[]? | "    PENDING Q[\(.id)]: \(.question)\n      options: \([.options[].id]|join(", "))"'
