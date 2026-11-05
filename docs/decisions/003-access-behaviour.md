# 003: Choices about access

**Status:** accepted

- **People outside a company get a 404, not a 403.** A 403 would tell them the company exists. A 403 is only for members whose role does not allow the action.
- **You can sign in before you confirm your email.** Otherwise a slow email would block your first visit. We show a message asking you to confirm.
- **You can only add a member who already has an account.** Email invites can come later.
- **Sign-up tells you if an email is already used.** The form would be confusing without this. Password reset always answers 200, so it does not give this away.
- **A refresh token gets 10 extra seconds after it is swapped.** Without this, people were signed out when they reloaded the page during a refresh. The server had swapped the token, but the browser cancelled the response and kept the old cookie. So the old token works one more time in those 10 seconds. It does not work after sign-out, trying again does not extend the time, and a real thief is still caught on the real user's next refresh.
