# DecisionBench

**Generate vs Decide** — benchmarking different approaches for bounded AI decisions.

> **Disclaimer.** This project implements a Jev-style fixed-choice scoring mechanism using
> open-source components. It does not reproduce TypeSafe's proprietary Jev model, weights,
> training process, or evaluation system.

Everything runs locally on open weights. No OpenAI, Anthropic, Gemini or any other paid API.
No SaaS, no credit card, no database. Total cost: ₹0.

---

## 1. The problem

A support request arrives. Your application already knows it can be exactly one of five things:

```
A = Billing    B = Technical    C = Account    D = Security    E = Other
```

That set was fixed before the request existed. It is part of the application, not something
the model gets to invent.

So: **when an application already knows the possible answers, why generate text just to choose one?**

DecisionBench runs four approaches against the same 54 labelled support tickets and shows you
what each one actually costs and actually gets right.

| Method | What it does |
|---|---|
| **Normal LLM** | Prompts Qwen to write `{"category": "..."}`, then parses the string. |
| **Structured output** | Same prompt, but the sampler is constrained to a JSON schema whose `category` is an enum over the five choices. |
| **Jev-style scoring** | Generates nothing. One forward pass, read the next-token logits, keep A/B/C/D/E, restricted softmax. |
| **Classifier** | A local TF-IDF + logistic-regression baseline, included as a reference point. |

The dashboard never declares a winner and never ranks the methods. It shows the tradeoffs.

---

## 2. Why bounded decisions are different from open-ended generation

Open-ended generation has an unbounded output space: any string is a candidate answer, and the
model's job is to find a good one. That is a genuinely hard search, and autoregressive
generation is a reasonable way to do it.

A bounded decision is not that problem. The output space has five elements. There is nothing
to search. The only question is *which of these five*, and the model already encodes an answer
to that question in a single position of its forward pass.

Generation re-derives, token by token, a structure the application never lost — the brace, the
field name, the quotes — and then your code throws all of it away to recover one of five values.
Every one of those tokens is a separate forward pass through the model.

Three things follow from treating the decision as bounded rather than open-ended:

1. **An invalid answer stops being representable.** Not "unlikely", not "caught by a retry" —
   it has no way to occur, because the only outputs are the five you declared.
2. **You get a distribution, not a sentence.** Relative probabilities over the decision space
   are something an application can act on — route, escalate, hold for review.
3. **There is nothing to parse,** so parsing cannot fail.

---

## 3. Normal LLM generation

```
POST /v1/chat/completions
```

The prompt ends with:

> Reply with only a JSON object of the form `{"category": "<category>"}` where `<category>` is
> exactly one of: Billing, Technical, Account, Security, Other. Output nothing else.

The model writes that JSON one token at a time. We then parse it and validate the value against
the five categories.

**Measured:** wall-clock latency around the HTTP call, `usage.completion_tokens` and
`usage.prompt_tokens` if the server reports them, and whether parsing succeeded.

Parsing is deliberately strict — we do not fuzzy-match a bare category name out of prose, because
*parsing success is one of the metrics being measured*. A failure is recorded as a failure, and
counts as not-correct in the benchmark.

**No confidence value exists for this method.** A generated string carries no per-choice score.
This is reported as `N/A`, never as 0 and never estimated.

---

## 4. Structured output

Same endpoint, **byte-identical prompt**, so the only variable between this and Normal LLM is
the decoding constraint. The backend negotiates the strongest constraint the server supports:

1. `response_format: {"type": "json_schema", ...}` with `category` as an enum
2. `regex` — `\{"category": "(Billing|Technical|Account|Security|Other)"\}`
3. `guided_regex` (vLLM naming)
4. unconstrained — and if it gets this far the result card says so explicitly, so you never
   mistake an unconstrained run for a constrained one

The constraint guarantees the *shape* of the answer. It does not remove the generation step:
the model still samples every token of that JSON. And it still produces no per-choice
probability, so confidence remains `N/A`.

---

## 5. Jev-style scoring

This is the mechanism the project exists to demonstrate.

```
USER REQUEST
      ↓
PROMPT                "Classify the support request into exactly one category.
      ↓                A = Billing  B = Technical  C = Account  D = Security  E = Other
TOKENIZER              ... Return only the label."
      ↓
QWEN                  one forward pass — no sampling loop
      ↓
NEXT TOKEN LOGITS     a raw score for every token in the vocabulary
      ↓
SELECT A/B/C/D/E      keep only the five single-token labels
      ↓
RESTRICTED SOFTMAX    normalise across those five values only
      ↓
PROBABILITIES
      ↓
DECISION              argmax
```

> Normal generation asks the model to generate an answer.
> Jev-style scoring asks the model to score a predefined set of possible answers.

The prompt is arranged so the answer would begin at exactly one position (the chat template's
assistant turn). We read the logits there and never sample.

### 6. Logits

At every position a language model produces a **logit** for each token in its vocabulary — a
raw, unnormalised score, roughly "how much this token belongs here". Generation turns logits
into a token by sampling, appends it, and runs the model again. That loop is what costs time.

Scoring skips the loop. The logits at the answer position already contain the model's
preference across our five labels.

### 7. Restricted softmax

A normal softmax over ~150,000 vocabulary logits gives the probability of every token, nearly
all of which are irrelevant. A **restricted softmax** is the same function applied to a chosen
subset:

```
P(label_i) = exp(logit_i) / Σ_j exp(logit_j)      for j in {A, B, C, D, E}
```

The five results sum to 1. Tokens outside the decision space are not competing for mass.

### 8. Single-token labels

`A`, `B`, `C`, `D`, `E` each tokenise to exactly one token for Qwen. That is what makes one
forward pass sufficient — a two-token label could not be scored at a single position without
running the model again.

This is a real constraint on the technique, not an implementation detail: a decision space whose
labels need multiple tokens cannot be scored this way.

### Transport

| Order | Mechanism | Generated tokens |
|---|---|---|
| 1 | SGLang `POST /v1/score` with `label_token_ids` + `apply_softmax` | 0 |
| 2 | `POST /v1/completions`, `max_tokens=1`, `logprobs=20`, restricted softmax computed locally | 1 |

Transport 1 is preferred and needs the single-token ids, resolved via `transformers` if installed
or a server `/tokenize` route if exposed. Transport 2 is a fallback that works on SGLang, vLLM
and llama.cpp. Whichever ran is named in the result card, and labels that fall outside the
top-20 are reported as such rather than silently given a made-up score.

### Reading the numbers

> These probabilities are relative probabilities across the declared choices. They should not
> automatically be interpreted as calibrated real-world probabilities.

A 0.91 means the model prefers that label nine-to-one over the four alternatives **it was
offered**. It does not mean it is right 91% of the time.

---

## 9. Human-review thresholds

```
AUTO DECIDE  if  top >= 0.80  AND  (top − second) >= 0.20
otherwise    HUMAN REVIEW
```

| Example | Outcome |
|---|---|
| Billing 0.91, Technical 0.03 | AUTO DECIDE |
| Billing 0.48, Technical 0.44 | HUMAN REVIEW |

Both thresholds are editable in the UI and via `AUTO_DECIDE_MIN_TOP` / `AUTO_DECIDE_MIN_MARGIN`.

**These thresholds are application-level policies, not requirements of Jev.** They are a decision
your application makes about how much relative confidence it wants before acting without a
person. Nothing in the scoring mechanism implies these particular numbers, or any numbers.

Methods that produce no probability cannot be evaluated against the policy at all. Normal LLM
and Structured therefore show `N/A` for human review — not "auto-decide", and not "always
review". That gap is itself one of the findings.

---

## 10. Benchmark methodology

Press **Run 54 Tickets** on the Benchmark tab, or `POST /api/benchmark`.

Every method in a run sees:

- the same tickets, in the same order
- the same ticket text, unmodified
- the same five choices, in the same order
- the same model and the same local server
- the same human-review thresholds

Requests are issued **one at a time**, never concurrently, so latency measures the model rather
than queue contention.

**Accuracy = correct / total.** A parse failure counts as not-correct — failing to produce a
usable answer is a real outcome, not missing data.

A metric that cannot be measured is `null` and renders as **N/A**. Token counts are never
estimated; if the local server does not report `usage`, the UI says N/A.

### Reproducibility

Every decision — from the UI or the API — is appended to `runs/decisions.jsonl`:

```json
{"timestamp": "...", "run_id": "...", "method": "jev", "mode": "live",
 "model": "Qwen/Qwen2.5-3B-Instruct", "ticket_id": "T037", "prediction": "Security",
 "ground_truth": "Security", "correct": true, "latency_ms": 612.4, "confidence": 0.72,
 "generated_tokens": 0, "parse_ok": true, "needs_human_review": true,
 "thresholds": {"min_top": 0.8, "min_margin": 0.2}}
```

The Benchmark tab also exports the current run as JSON or CSV.

### Prompt fairness, stated plainly

Normal LLM and Structured get byte-identical prompts. Jev-style necessarily differs in its final
instruction — "Return only the label" instead of "Reply with only a JSON object" — because that
instruction *is* the mechanism under test. Everything before that line is identical, built by the
same `core_prompt()` function in `backend/engines/base.py`.

---

## 11. Dataset design

`data/tickets.json` — **54 realistic support scenarios**, hand-labelled.

```json
{
  "id": "T037",
  "text": "I don't recognize the subscription charge on my card. I checked my account and there is a new subscription that I don't remember purchasing.",
  "category": "Security",
  "difficulty": "hard",
  "reason": "Surface vocabulary is entirely billing, but an unrecognised subscription created on the account indicates unauthorised access. Billing should retain meaningful probability."
}
```

**`reason` is ground-truth annotation metadata only. It is never included in any prompt sent to
a model.** `GET /api/tickets` does not even return `category` or `reason`, so the UI cannot
reveal ground truth before a method has run.

| Difficulty | Count | Share |
|---|---|---|
| easy | 11 | 20% |
| medium | 23 | 43% |
| hard | 20 | 37% |

| Category | Billing | Technical | Account | Security | Other |
|---|---|---|---|---|---|
| Count | 14 | 13 | 10 | 10 | 7 |

The set is deliberately not uniformly easy. It includes:

- **Billing vs Account** — a charge succeeded, then an email change made the subscription vanish
- **Billing vs Technical** — payment confirmed by the bank, app still shows the old plan
- **Security vs Account** — locked out, unrequested reset email, profile email changed
- **Security vs Billing** — an unrecognised charge *and* an unrecognised subscription
- **Technical vs Account** — works on phone, redirects to login on laptop
- **Multi-intent** — charged twice, and also can't change the password
- **Misleading context** — "my dashboard is fine and my password is fine, but my invoice is wrong"
- **Indirect language** — "the amount leaving my bank account doesn't match what I expected"
- **Vague** — "something strange happened with my account after yesterday's login"
- **Long context** — timelines, resolved side-issues, troubleshooting already done, irrelevant detail
- **Emotional** — frustration and repeated resets masking an infrastructure problem
- **Genuinely close calls** — T050 asks whether stale UI state is a data leak; the label is
  Technical, but Security deserves real probability and human review is the right outcome
- **Other** — enquiries that fit none of the four, which is why the fifth option exists

### Why `Other` matters

> Without an Other/Escalate option, restricted scoring is forced to distribute probability among
> the available categories even when none is appropriate.

If the declared choices are not exhaustive, the softmax has nowhere to put the mass. It will
return a confident-looking answer to a question you never asked. An escape hatch is not optional
in a fixed-choice system.

---

## 12. Local setup

```
decisionbench/
├─ frontend/            React + Vite + Tailwind + Recharts
│  ├─ src/components/   cards, tables, flow diagrams, charts
│  ├─ src/pages/        Decide · Benchmark · How it works
│  ├─ src/api/          fetch client
│  └─ src/App.jsx
├─ backend/
│  ├─ main.py           FastAPI routes
│  ├─ runner.py         single dispatch path for UI + benchmark
│  ├─ benchmark.py      aggregation
│  ├─ schemas.py        pydantic models
│  ├─ config.py         everything env-overridable
│  ├─ dataset.py
│  └─ engines/
│     ├─ base.py        shared prompt, softmax, review policy
│     ├─ normal_llm.py
│     ├─ structured.py
│     ├─ jev_scorer.py
│     ├─ classifier.py
│     └─ demo.py
├─ data/tickets.json
├─ runs/                append-only decision log
├─ requirements.txt
└─ .env.example
```

> `package.json` lives in `frontend/` rather than the repository root, because that is where a
> Vite project's manifest has to be for `npm run dev` to work.

### Backend

```bash
cd decisionbench
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
cp .env.example .env            # optional

uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd decisionbench/frontend
npm install
npm run dev                     # http://localhost:5173, proxies /api to :8000
```

Or build once and let FastAPI serve it from a single origin:

```bash
npm run build                   # then open http://127.0.0.1:8000
```

**The app works with no model installed.** See [Demo mode](#demo-mode) below.

### Optional extras

```bash
pip install -r requirements-optional.txt   # transformers
```

`transformers` lets the Jev engine resolve single-token label ids (enabling `/v1/score`) and
apply the model's own chat template. Without it, the engine falls back to next-token logprobs
and hand-built Qwen ChatML — both work.

---

## 13. Qwen setup

Any small open-weight instruct model works. The default is `Qwen/Qwen2.5-3B-Instruct`; use
`Qwen2.5-1.5B-Instruct` on modest hardware or `Qwen2.5-7B-Instruct` if you have the VRAM.

```bash
MODEL_NAME=Qwen/Qwen2.5-1.5B-Instruct
```

Weights download from Hugging Face on first run. No account or token is needed for Qwen2.5.

---

## 14. SGLang setup

SGLang is what provides `/v1/score`, so it is the preferred server.

```bash
pip install "sglang[all]"

python -m sglang.launch_server \
  --model-path Qwen/Qwen2.5-3B-Instruct \
  --host 127.0.0.1 --port 30000
```

Then point the backend at it (these are already the defaults):

```bash
SGLANG_BASE_URL=http://127.0.0.1:30000
```

Reload the app. The header badge flips from **DEMO MODE** to **LIVE LOCAL MODEL**, and
*How it works → Current configuration* shows which transport the scorer resolved.

**vLLM or llama.cpp** work too for the generative methods, and the Jev engine falls back to the
`/v1/completions` logprobs transport:

```bash
GEN_BASE_URL=http://127.0.0.1:8001
```

### Demo mode

If no model server answers, the app stays fully usable:

- the header shows **DEMO MODE — local model unavailable**
- every affected card and table cell is tagged `DEMO`
- responses come from a deterministic local heuristic — the same input always gives the same output
- latency and token charts on the Benchmark tab are **suppressed**, not filled with plausible
  numbers, because there is no model to measure
- `FORCE_DEMO=1` forces it on even with a server running

Demo values are never presented as model measurements. The Classifier is the one method that is
always live, because it runs in-process and never needed the model server.

---

## 15. API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | mode, model, endpoints, tokenizer, classifier backend, dataset stats |
| `GET` | `/api/tickets` | id, text, difficulty — **no ground truth** |
| `GET` | `/api/tickets/random?difficulty=hard` | one random ticket |
| `POST` | `/api/decision/normal` | |
| `POST` | `/api/decision/structured` | |
| `POST` | `/api/decision/jev` | |
| `POST` | `/api/decision/classifier` | |
| `POST` | `/api/benchmark` | run methods across the dataset server-side |

Request:

```json
{ "ticket_id": "T037", "min_top": 0.8, "min_margin": 0.2 }
```

or `{ "text": "...", ... }` for free text. All four decision endpoints return the same shape:

```json
{
  "method": "jev",
  "ticket_id": "T037",
  "decision": "Security",
  "latency_ms": 612,
  "generated_tokens": 0,
  "probabilities": {
    "Billing": 0.02, "Technical": 0.08, "Account": 0.15,
    "Security": 0.72, "Other": 0.03
  },
  "confidence": 0.72,
  "needs_human_review": true,
  "mode": "live",
  "parse_ok": true,
  "ground_truth": "Security",
  "correct": true
}
```

`ground_truth`, `difficulty` and `correct` appear only when the request referenced a dataset
ticket, and only in the response — after the decision was produced.

---

## 16. Limitations

- **The probabilities are relative.** Normalised across five labels the model was handed. Not
  calibrated, and not a claim about real-world frequency.
- **54 tickets is a small sample.** A few points of accuracy difference between methods is noise
  at this size. The dataset is a probe for behaviour, not a leaderboard.
- **Labels are one annotator's judgement.** Several hard tickets are genuinely arguable — that is
  why they are there, but it means "incorrect" sometimes means "defensibly different".
- **Prompts cannot be perfectly identical** across all four methods; see §10.
- **Latency is environment-bound.** It depends on your hardware, the server's batching and KV
  cache state. Compare methods within one run, not across machines.
- **Scoring requires single-token labels.** A decision space needing multi-token labels cannot be
  scored in one forward pass this way.
- **The classifier is a reference point, not a contender.** TF-IDF + logistic regression trained
  on this project's own 54 rows — far too small for a production classifier. Benchmark
  predictions are made out of fold (5-fold stratified), so no ticket is ever scored by a model
  that trained on it, but its numbers should be read as a floor. Free text typed into the UI is
  scored by a model fitted on all rows and is labelled as such. Without scikit-learn installed it
  degrades to a hand-written keyword heuristic, clearly labelled in the UI.
- **This is not a Jev reproduction.** See the disclaimer at the top.

---

## Licence

Open source. Qwen2.5 is released by Alibaba under its own licence; SGLang is Apache-2.0.
