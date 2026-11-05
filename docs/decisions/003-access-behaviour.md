# 003: Access behaviour worth writing down

**Status:** accepted

- **Non-members get 404, not 403.** A 403 would confirm the company exists. A 403 is only for members whose role does not allow the action.
- **Unverified emails can sign in.** Blocking them would make a first visit fail on a delayed email. Verification matters for sending reminders, so it is prompted rather than enforced.
- **Adding a member requires an existing account.** Email invitations can come later. Returning 404 for an unknown address is acceptable here because only company admins can call it.
- **Registration reveals that an email is taken.** A sign-up form has to say so to be usable. Password reset, where it is avoidable, always answers 200.
- **A just-rotated refresh token gets a 10-second grace window.** Strict reuse detection signed people out when they reloaded mid-refresh: the server had rotated, but the browser cancelled the response and kept the old cookie. Within the window, the old token is accepted once more and its unseen successor is dropped. Signed-out sessions are excluded because they have no live successor, retries cannot extend the window, and a real thief is still caught when the victim's next refresh presents a dead token.
