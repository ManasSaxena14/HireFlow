# 013: Boards that follow the hiring process

**Status:** accepted

Before this, a person's own job board and a company's hiring pipeline were two separate things. A recruiter moving someone to "Interview" changed nothing on that person's board, and every screen only changed when the person using it did something.

- **A card on the job board can follow a company application.** `tracked_applications.company_application_id` links the two. When a company moves a candidate, the card is changed in the same transaction, so the two can never disagree. Each change writes a history line, cancels the follow-up reminder when it should, and adds a notification.
- **Only a person who proves their email gets a card.** The apply form is public, and anyone can type any email. If that alone made cards, anyone could put text of their choosing on a stranger's board. So a card is made only when the applicant is signed in, the account's email is confirmed, and it is the email on the form. Later moves by the company only change a card that already exists. They never make one.
- **The web form signs the person in at that moment.** The login is kept only in memory, so on the public page it is looked up once, when they press send. The form says so, and the thank-you page says if the card was made.
- **A card the person made by hand is joined, not copied.** The same job, company and place gives one card.
- **The company wins.** If the person moves a linked card by hand, the next move by the company puts it back in step. The card is marked "Live" so this is not a surprise.
- **Hired shows as an offer.** The job board has no hired status, so the card stays on "Offer", and the person still gets a history line and a notification once.
- **The candidate never sees why.** A rejection reason is for the company only. The card says "Not selected", and the notification says the company did not select the application.
- **A card the person archived stays quiet.** It still changes, but there is no notification.
- **Deleting the candidate keeps the card,** now without the link. The person's own record is theirs.
- **Interviews reach the candidate too.** A booked, moved or cancelled interview adds a notification for a candidate with an account. `/me/interviews` already looked at this link, and nothing had ever set it before, so candidates never saw their interviews.
- **Screens ask again instead of holding a connection open.** A held connection (SSE or WebSockets) would keep a free host awake and would not survive a sleeping server well. So screens ask again every 15 to 60 seconds, but only while the tab is open and in view. Background tabs do not ask, and a board that is being dragged is left alone, so nothing jumps under the person's hand.
- **A new notification refreshes everything it could change.** The notification list is already asked every 20 seconds, so it is the signal. When something new arrives, the job board, interviews and company screens are refreshed at once and a short message pops up.
- **Not built:** a person withdrawing on their own board does not change the company's side. A company's pipeline is the company's decision.
