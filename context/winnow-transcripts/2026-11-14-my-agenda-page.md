# Build the My Agenda page

- **Title:** Build the My Agenda page
- **Date:** Unknown (the transcript is undated; Winnow ran on 2026-11-14)
- **Participants:** Unknown (unnamed speakers in an Otter transcript)
- **Source:** `transcripts/feature_1_agenda.txt`
- **Tickets raised:**
  - [#3 Build the My Agenda page: a read-only view of your reserved sessions](https://github.com/bobbyno/nam-2026-conference/issues/3)
- **Context updated:** `context/product-context/prd.md`: My Agenda is a read-only view of the sessions an attendee already holds, not a way to find sessions; recommendations are the stated next step. The pull request for #3 updates `engineering-context/agenda.md` and CLAUDE.md's "Deliberately unbuilt" list.
- **Set aside:**
  - Small talk and workshop narration ("extra effort team", "we won't publish it", "feed this to Claude"): not requirements.
  - An "Add to Agenda" button on the schedule: it already exists, because adding a session takes a seat.
  - The authorization aside: the app has no auth, which the context already says.
  - The other three brief pain points (overwhelm, not personalized, hard to find talks): they belong to other features.
  - Recommendations and finding new sessions on this page: named as the next step, not part of this one.
- **Q&A:**
  - *The garbled line at 0:29 ("social dispositions across classes. flash flag"): is it a clash flag?* Winnow read it as flagging sessions that overlap in time. The answer was that the page only covers sessions already on the schedule and signs you up for nothing, so the flag is display only, with no swap dialog.
  - *Does the page have a Remove button, or does it only reflect removals made elsewhere?* Display only, no button. The page updates live when a reservation changes elsewhere.
