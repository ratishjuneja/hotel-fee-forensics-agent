# Terms of Use / User Agreement

_Last updated: 2026-07-05_

BellBoy ("the project," "the software," "we") is an **open-source hackathon
demonstration** of an owner-side agent that audits hotel operator fees. By accessing the
repository or using the hosted demo, you agree to these terms. The software is licensed
under the [MIT License](LICENSE); these terms govern **use of the running application and
demo** and do not restrict the rights the MIT License grants to the source code.

## 1. Demonstration software, provided "as is"

This is a hackathon build, not a production service. It is provided **"as is," without
warranty of any kind**, express or implied — including accuracy, reliability, availability,
or fitness for a particular purpose (mirroring the MIT License disclaimer). The public demo
may be taken offline, reset, or changed at any time without notice.

## 2. Not professional advice

BellBoy recomputes fees and generates an audit memo and a draft dispute email for
**informational and demonstration purposes only**. Its output is **not legal, financial,
accounting, tax, or other professional advice**, and no attorney–client, advisor, or
fiduciary relationship is created by using it. Do not rely on it to make disputes,
payments, or business decisions. Always consult a qualified professional and verify every
figure against your own records before acting.

## 3. Synthetic demo data

All documents and financials bundled in this repository (under `data/demo/`) are
**synthetic**. They do not represent any real hotel, contract, operator, owner, or
transaction, and any resemblance to real entities or data is coincidental.

## 4. Content you upload

- Upload **only** documents you have the right to use. Do **not** upload real confidential,
  proprietary, personal, or regulated data into the demo.
- You are solely responsible for the content you upload and for how you use any output.
- To perform an audit, document content is sent to third-party infrastructure — **Vultr
  Serverless Inference** (for retrieval scoring) and **Vultr Object Storage / Managed
  PostgreSQL** (for storage) — for processing. Treat the demo as a shared, non-private
  environment and assume uploads are not confidential.

## 5. No guarantee of accuracy or availability

Fee calculations are performed by a deterministic calculator from the documents you
provide; extracted rules and drafted prose come from a model and may be incomplete or
wrong. We do **not** guarantee that findings, totals, citations, or generated text are
accurate or complete. Uptime, data retention, and results are **not** guaranteed.

## 6. Limitation of liability

To the maximum extent permitted by law, the authors and copyright holders are **not liable**
for any claim, damages, loss, or other liability arising from your use of the software, the
demo, or its output. Your use is entirely at your own risk.

## 7. Acceptable use

Use the software lawfully. Do not use it to violate any third party's rights, to upload data
you lack rights to, or to attack, overload, or abuse the demo infrastructure.

## 8. Changes

These terms may be updated as the project evolves. The current version lives in this file in
the repository.
