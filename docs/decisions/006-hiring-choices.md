# 006: Choices made for the hiring side

**Status:** accepted

The plan left a few things open. These are the choices we made.

- **Interviewers are given people by hand.** The plan says an interviewer sees people through an interview, but interviews come in the next phase. So we added the `application_assignments` table and the `/assignees` routes. Booking an interview can add a row here later, and nothing else has to change.
- **What a hiring manager can do.** They can read all jobs and move people on any job, because the roles table allows it. They can only change, publish or close the jobs they created. Interviewers can only read jobs that have someone given to them.
- **Each application keeps its own resume.** We added `applications.resume_file_id`. The apply form is public and nobody proves they own an email, so one form must not change what is on file for another application. For the same reason, a new form never changes the name of someone already on file.
- **Scores stay private for interviewers.** An interviewer sees only their own score, and not the average, so other votes do not sway them.
- **Step emails are simple.** A step has an optional subject and message, stored on `pipeline_stages`. They are off by default, so moving someone never sends a surprise email.
- **Files are saved on disk.** There is no paid storage here, so resumes go in `UPLOAD_DIR`, under a random name. All code goes through the `FileStorage` class, so another store only needs one new class.
- **Download links.** A link works for 5 minutes and is signed with its own key, which is made from `JWT_REFRESH_SECRET`. This means one less secret to manage. Changing that secret only ends the links that are open at that moment.
- **Changing steps.** A step with people in it cannot be removed or change type. Otherwise someone could end up in "not selected" with no reason.
- **Links to user accounts.** `candidates.user_id` stays empty for now. An email on a public form does not prove who someone is, so we will not link them until people can confirm it.
