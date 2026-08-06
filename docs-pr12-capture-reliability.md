# PR #12: session reset and RFID capture reliability

Starting a **new session** now clears the preceding run's accepted-lap projections, completion state, acknowledgement metadata, raw-event indexes, and timing caches before the new roster projection is initialized. Roster entries and the newly selected start/wave offsets remain available. This is distinct from **recovering the same interrupted session**, which continues to restore its legitimate accepted laps and audit records.

RFID keyboard-wedge capture is handled at page level and no longer depends on a hidden input retaining focus. Buttons, checkboxes, scrolling, DONE acknowledgement, and opening or closing Runner Overview do not suspend capture. Genuine editable fields (`input`, `textarea`, `select`, and editable content) retain normal typing, and each tag plus Enter follows the existing canonical RFID processing path exactly once. Partial values retain the existing timeout and audit behavior.

The Live Gate readiness banner means only that this browser window has focus and the document is visible:

- **SCANNER ARMED — Browser ready for RFID input**: the page can receive keyboard input.
- **INPUT LOST — Return to this page**: focus or document visibility has been lost.

The banner does **not** detect or prove that the physical RFID reader is powered, connected, or transmitting. If the reader beeps but the tracker records nothing, Notepad remains a useful independent diagnostic for checking the reader's keyboard output before investigating the browser or tracker.
