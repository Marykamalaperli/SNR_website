# Documents domain (planned)

> Target storage is private S3 through FastAPI-authorized upload and download intents.

Private Storage only. Authorize tenant/owner/category and scan/validate uploads
before short-lived signed access. Never expose bucket-wide public URLs. Retention
and consent policy require approval. No upload/download endpoints yet.
