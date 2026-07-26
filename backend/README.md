# PPTist Cloud API

This single-user API adds authenticated PostgreSQL cloud document storage to PPTist.

Required environment variables:

- `PPTIST_ADMIN_USERNAME`: initial user name (defaults to `alien`)
- `PPTIST_ADMIN_PASSWORD_HASH`: a `scrypt$salt$key` password hash; required only when the user table is empty
- `PPTIST_ALLOWED_ORIGIN`: public application origin, for example `https://ppt.example.com`
- `PPTIST_DATABASE_URL_FILE`: root-readable PostgreSQL URL file (production default: `/etc/pptist-cloud/database-url`)
- `PPTIST_DB_POOL_MAX`: maximum PostgreSQL connections (defaults to 5)
- `PPTIST_MEDIA_CREDENTIAL_SECRET_FILE`: file containing at least 32 random characters used to encrypt per-user media API keys
- `PPTIST_MEDIA_API_BASE`: authenticated media API base, for example `https://media.kjxs.site/api`
- `PPTIST_MEDIA_PUBLIC_BASE`: public media origin, for example `https://media.kjxs.site`
- `PPTIST_MEDIA_MAX_IMAGE_BYTES`, `PPTIST_MEDIA_MAX_SVG_BYTES`, `PPTIST_MEDIA_MAX_AUDIO_BYTES`, `PPTIST_MEDIA_MAX_VIDEO_BYTES`: upload limits by media kind

Runtime data, database URLs and password hashes must not be committed to Git. Use
`scripts/migrate-sqlite-to-postgres.mjs` once when upgrading an existing SQLite deployment.

The media API key is entered by the signed-in user in the document manager. The
browser never receives the stored plaintext value. The server verifies the key,
encrypts it with AES-256-GCM and stores only the ciphertext in PostgreSQL. Keep the
credential secret file outside the repository with mode `0600`; losing it requires
binding the media API key again.
