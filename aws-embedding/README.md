# AWS Lambda Embedding Service

Container-image Lambda that runs `sentence-transformers/all-MiniLM-L6-v2` (384-dim, L2-normalized).

## Deploy
1. Build & push to ECR, create Lambda from container image (1024-2048MB, 30s timeout).
2. Create Function URL (Auth NONE + secret header check, or AWS_IAM).
3. Set env: `LAMBDA_EMBEDDING_SECRET` (shared secret), `EMBEDDING_MODEL`, `LOG_LEVEL`.
4. FastAPI Render: `EMBEDDING_PROVIDER=lambda`, `LAMBDA_EMBEDDING_URL=https://<id>.lambda-url.../`, `LAMBDA_EMBEDDING_SECRET=same`.

## Request
POST Function URL with header `X-Embedding-Secret: <secret>`
```json
{"texts": ["hello world", "second text"]}
```
## Response
```json
{"embeddings": [[...384...],[...384...]], "dimension": 384, "count": 2}
```
Errors: 400 invalid input, 401 unauthorized, 500 inference failure.
