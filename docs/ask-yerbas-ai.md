# Ask Yerbas AI prototype

Ask Yerbas is an optional, read-only natural-language interface for the Yerbas explorer.

## Safety boundary

The prototype does **not** expose arbitrary RPC, wallet signing, private keys, transaction creation, or transaction broadcast.

It reads only data already available to the explorer or through existing read-only explorer functions.

## Enable

Set the feature flag before starting the explorer:

```bash
export YERBAS_AI_ENABLED=true
npm start
```

Then open:

```text
/ask
```

The built-in local interpreter currently supports:

- current block height
- smartnode count
- smartnode collateral counts, including questions such as 69,000 YERB collateral
- current supply
- current explorer price values
- a compact network summary
- transaction lookup/explanation for a supplied 64-character transaction id

## Optional AI provider

Broader questions can be sent to an OpenAI-compatible chat endpoint. The model only receives a compact read-only snapshot of current explorer data plus the user's question.

```bash
export YERBAS_AI_ENABLED=true
export YERBAS_AI_BASE_URL=http://127.0.0.1:11434/v1
export YERBAS_AI_MODEL=your-model-name
# Optional for providers that require bearer authentication:
export YERBAS_AI_API_KEY=...
npm start
```

The service sends requests to:

```text
$YERBAS_AI_BASE_URL/chat/completions
```

## Optional limits

```bash
export YERBAS_AI_RATE_LIMIT=20
export YERBAS_AI_MAX_QUESTION_LENGTH=500
export YERBAS_AI_TIMEOUT_MS=12000
```

The rate limit is per explorer process and per observed client address. It is intended as a first-line guard for this prototype, not a replacement for reverse-proxy rate limiting.

## Endpoints

```text
GET  /ask
GET  /ext/ai/status
POST /ext/ai/query
```

Example request:

```bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{"question":"How many smartnodes have 69,000 YERB collateral?"}' \
  http://127.0.0.1:3001/ext/ai/query
```

The response reports whether the answer came from the built-in read-only interpreter or the configured AI provider.
