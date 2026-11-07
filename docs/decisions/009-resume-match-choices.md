# 009: Choices made for resumes and the match score

**Status:** accepted

The plan left a few things open. These are the choices we made.

- **No browser extension.** The plan's Phase 6 also has a browser extension, with an `api_tokens` table and a save-from-extension route. This project does not have an extension, so none of these were built. People add a job by hand, or save it from Find jobs.
- **Added `status` and `parse_error` to `resumes`.** Reading happens after the upload, so the screen needs to know if a file is still being read, or why it could not be.
- **Added `sections_found`, `suggestions` and `breakdown` to `resume_matches`.** Past checks can then show the same report, without keeping the job text.
- **The job text is not saved.** It is used for the score and then dropped, because it may be long or private. A check of pasted text keeps only a name.
- **The dictionary is in `packages/shared/src/skills.json`,** not next to `package.json`, so it is built along with the rest of the package.
- **Punctuation stays where it matters.** The plan says to remove punctuation, but that would turn C++ into C. We keep +, # and a dot inside a word, and aliases go through the same steps as the text.
- **A few skills need exact capitals.** Go, R, C and Excel are also normal words, so in those forms they only count with these capitals, and never in "Go to", "R&D" or "C-level". The word "golang" always counts.
- **Longest name first.** "React Native" is found first and then blanked out, so it does not count as React too.
- **A job with no known skills has a coverage of 0.** The plan's formula would divide by zero. The score then only uses the other two parts, and the report says why it looks low.
- **Resumes are read on their own thread,** with a time and memory limit, and we check how big a Word file will open up to before opening it. Files come from strangers, and a bad one must not stop emails from going out.
- **The worker needs the same `UPLOAD_DIR` as the API.** A relative folder means the one in `apps/api`, where the API saves files in development. `pnpm start` passes both the same full path. If you ever run them on two machines, they need a shared disk, or a new `FileStorage` class.
- **Reading fails after three tries.** The resume is then marked as failed with a clear message, and the person can upload it again. A file with no text, such as a scan, fails at once, because trying again would not help.
- **Each person can keep 10 resumes.** It keeps one account from filling the disk.
