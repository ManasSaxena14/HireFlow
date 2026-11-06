# 007: Choices made for interview booking

**Status:** accepted

The plan left a few things open. These are the choices we made.

- **Extra table for offers.** The plan has a booking link but no place to keep the times offered. We added `interview_offers`. A new offer for a person stops their old one, so only one link is live.
- **The link is a signature, not a stored secret.** It is the offer id and a signature, using a key made from `JWT_REFRESH_SECRET`. Changing that secret stops open links, and we can send new ones. The time limit is in the offer row, so it can be seen and changed.
- **Hours belong to a company.** `/me/availability` needs `companyId`, because the plan's tables have `company_id` and a person can be in two companies. Interviews count in every company, because a person cannot be in two places. Other companies see only that the time is busy.
- **Added `candidate_timezone` to interviews.** Candidates have no account or saved zone. When they book through the link, we keep their browser's zone for their emails. When a recruiter books, we use the interviewer's zone. Every email names the zone.
- **Recruiters can book outside working hours.** The screen only offers free times, but the API does not refuse other times. Sometimes a person really will stay late. The database rules still stop overlaps.
- **Candidate reminders have no row of their own.** A reminder row needs a user, and most candidates have no account. So one row sends both the interviewer's reminder and the candidate's email.
- **Calendar links in emails do not run out.** Candidates may add the interview at any time, and the file only holds the time, the job and the meeting link. Team notes never go in a calendar file.
- **One interviewer per interview.** Free times can be checked for up to five people, as the plan says. Panel interviews are left for later, also as the plan says.
- **Members with interviews coming up cannot be removed.** Otherwise a candidate could be waiting for someone who has left. Please cancel or change those interviews first.
