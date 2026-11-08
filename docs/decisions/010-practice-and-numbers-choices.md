# 010: Choices made for practice and hiring numbers

**Status:** accepted

The plan left a few things open. These are the choices we made.

- **The optional text-writing features in section 11 are not built.** The plan made them optional and gave each one a fallback that works without them. This project uses the fallbacks: adding a job by hand, the rule-based resume score, and no rewriting of resume lines. So there is no provider, no flag on companies, and no routes for them. Every screen works the same.
- **One review per topic, whatever the capital letters.** The plan has `UNIQUE (user_id, topic)`. We use a unique index on `lower(topic)` instead, so "Graphs" and "graphs" are one topic.
- **Logging a topic for the first time adds it to the reviews, due tomorrow.** The plan has review items but does not say how they start. Practising a topic today is like a first review, so the first real review is the next day. Logging the same topic again does not change its review date.
- **Review dates use the person's own calendar.** "Today" is worked out in their time zone, so a review due today does not show up or vanish at midnight UTC.
- **The ease factor is saved with two decimals,** as the plan's `numeric(4,2)` column says, and the next grade starts from the saved value.
- **Grades are in words on screen.** 0 to 5 become No idea, Wrong, Almost, Hard, Good and Easy. Under 3 means the topic starts again tomorrow.
- **A streak is days in a row with practice, counted in the person's time zone.** It is still going if the last day was today or yesterday.
- **The funnel counts the furthest step reached.** Someone turned down after an interview counts as applied, first round and interview. Steps are grouped by their type, because each job can name its steps differently.
- **Time to hire ends when a person is moved to a hired step.** It counts people hired in the date range, and shows the middle value, the average, the fastest and the slowest.
- **Hiring numbers are for admins, recruiters and hiring managers.** Interviewers only see the people given to them, so company-wide numbers are not for them.
- **Date ranges are whole UTC days,** with both ends included. The default is the last 90 days.
