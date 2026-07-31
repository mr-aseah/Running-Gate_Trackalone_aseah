# PR #11 — Live Gate field view

During an active class session the default capture dashboard is a two-column field view:

* **Live Gate** keeps the five latest accepted laps large and readable. Its compact **DONE — DIRECT OUT** queue pins every completed runner until a teacher taps the large empty acknowledgement box.
* **Chronological Events** is a newest-first, independently scrolling audit view of accepted, duplicate, unknown, malformed, and post-completion RFID outcomes. An extra scan after completion is retained in the raw audit and labelled **EXTRA SCAN AFTER DONE — REVIEW**; it never creates another official lap. The newest 50 events render first for capture performance; **Show older events** reveals the retained history in further batches.

The **Runner Overview** control opens the existing compact roster strips as an independently scrolling third column on the extreme left. Closing it restores the larger two-column layout.

A DONE acknowledgement is operational metadata only: it means the teacher saw the alert and directed the runner out. It records an acknowledgement timestamp and survives session recovery, but does not change laps, finish time, raw events, corrections, or exports. **Restore last acknowledged** returns only the most recently acknowledged alert to the queue.

RFID capture remains asynchronous to these controls: acknowledging a finisher, restoring an alert, opening the overview, and scrolling panels do not pause capture or require the teacher to act before another scan.
