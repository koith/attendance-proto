# Backup recovery implementation

This directory is reserved for tested, non-destructive backup and isolated restore code. Production SQL/Auth/Storage are not modified by documentation changes.

- Encrypt before any upload to publicly readable systems.
- Never place private keys or production rows in source control.
- Restore only into an isolated, disposable database.
