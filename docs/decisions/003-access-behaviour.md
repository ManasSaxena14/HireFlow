# 003: Access behaviour worth writing down

**Status:** accepted

- **Non-members get 404, not 403.** A 403 would confirm the company exists. A 403 is only for members whose role does not allow the action.
- **Unverified emails can sign in.** Blocking them would make a first visit fail on a delayed email. Verification matters for sending reminders, so it is prompted rather than enforced.
- **Adding a member requires an existing account.** Email invitations can come later. Returning 404 for an unknown address is acceptable here because only company admins can call it.
- **Registration reveals that an email is taken.** A sign-up form has to say so to be usable. Password reset, where it is avoidable, always answers 200.
