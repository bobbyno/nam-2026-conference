# Select multiple tracks on the schedule

- **Title:** Select multiple tracks on the schedule
- **Date:** Unknown (the transcript is undated; Winnow ran on 2026-11-14)
- **Participants:** Unknown (a single unnamed speaker)
- **Source:** `context/winnow-transcripts/demo-transcript.txt`
- **Tickets raised:**
  - [#1 Select multiple tracks in the /schedule track filter](https://github.com/bobbyno/nam-2026-conference/issues/1)
- **Context updated:** None. The multi-value filter convention is already in `context/engineering-context/schedule.md` (Gotchas); the pull request for #1 updates that doc to say the track filter follows it.
- **Set aside:**
  - Opening narration ("let's take a look at the website"): not a requirement.
  - The limitation restated at 0:29 and 0:33: counted once.
  - The `/speakers` track filter: the speaker only mentioned talks, so it stays single-select; a separate ticket if wanted.
- **Q&A:**
  - *Does multi-select apply to `/schedule` only, or to `/speakers` too?* `/schedule` only.
  - *How should "All tracks" behave beside multi-select?* It is active when nothing is selected, and clicking it clears the selection; unselecting the last track returns to All.
