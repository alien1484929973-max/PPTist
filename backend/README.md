# PPTist Cloud API

This single-user API adds authenticated PostgreSQL cloud document storage to PPTist.

Required environment variables:

- `PPTIST_ADMIN_USERNAME`: initial user name (defaults to `alien`)
- `PPTIST_ADMIN_PASSWORD_HASH`: a `scrypt$salt$key` password hash; required only when the user table is empty
- `PPTIST_ALLOWED_ORIGIN`: public application origin, for example `https://ppt.example.com`
- `PPTIST_DATABASE_URL_FILE`: root-readable PostgreSQL URL file (production default: `/etc/pptist-cloud/database-url`)
- `PPTIST_DB_POOL_MAX`: maximum PostgreSQL connections (defaults to 5)

Runtime data, database URLs and password hashes must not be committed to Git. Use
`scripts/migrate-sqlite-to-postgres.mjs` once when upgrading an existing SQLite deployment.
