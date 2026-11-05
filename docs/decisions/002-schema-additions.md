# 002: Small schema additions

**Status:** accepted

Three things were added beyond the planned schema, each because a rule could not be expressed without it.

- **`reminders.kind`** (`follow_up`, `custom`, `interview`). Moving a card to rejected, withdrawn or offer must cancel the automatic follow-up but leave reminders the user wrote. Matching on message text would be fragile. A partial unique index also guarantees one pending follow-up per card.
- **`email_deliveries`.** Queue retries are at-least-once, but a reminder must arrive once. This table records what has gone out, keyed by a dedupe key.
- **Audit log trigger.** The plan was to `REVOKE UPDATE, DELETE` from the application role. A trigger holds regardless of which role connects, which matters on hosted databases where the app often connects as the owner.
