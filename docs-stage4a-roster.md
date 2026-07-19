# Stage 4A V2 Roster CSV Contract and Stable Runner Identity

## Final roster schema

V2 roster CSV files use exactly these canonical headers:

```csv
runner_no,tag_id,name,class,start_offset_seconds,active
```

Sample V2 roster contents are also available in the app through **Download sample V2 roster**:

```csv
runner_no,tag_id,name,class,start_offset_seconds,active
1,0001,Sample Runner A,Demo,0,true
2,0012,Sample Runner B,Demo,10,yes
3,0103,,,20,1
4,0004,Inactive Example,Demo,0,false
```

## Validation rules

- Imports support 1 to 120 records. The validated routine operating target remains up to 100 active runners.
- `runner_no` is required, unique, and a positive integer. It is the stable runner identity.
- `tag_id` is required for active runners and kept as a string.
- For roster import only, tag values containing one to four digits are padded to four digits, so `1`, `01`, `001`, and `0001` all become `0001`.
- Duplicate tag IDs are detected after normalisation.
- Current SM206 capture remains four numeric characters; roster tags outside that profile are rejected with row-specific errors.
- `name` and `class` may be blank.
- `start_offset_seconds` is required, numeric, and non-negative. Stage 4A stores and snapshots it but does not apply it to timing.
- `active` is required and accepts `true/false`, `yes/no`, and `1/0` case-insensitively.
- Invalid replacement files are rejected atomically and the previously loaded roster is preserved.

## Legacy migration rules

Legacy CSV files with tag headers such as `tagId`, `tag_id`, or `id` continue to load. The importer assigns `runner_no` from an existing valid runner column where available, otherwise from CSV row order starting at 1. Legacy saved V1 roster objects whose `id` was historically the tag are migrated with row-order `runner_no`; the old `id` is treated as tag fallback, not as canonical runner identity. Legacy rows default to `start_offset_seconds=0` and `active=true`, and supported `name`, `class`, `gender`, `age_group`, and `email` fields are preserved.

## Stable identity and migration

Stage 4A uses `runner_no` (stored internally as the string `student_id`/`id`) as stable roster identity. `tag_id` is editable and is maintained separately through a tag-to-runner lookup for future scans. Accepted-lap identity snapshots and raw RFID events are immutable and are not rewritten after roster edits. Older Stage 1–3 snapshots whose `student_id` was historically the tag ID are restored safely by normalising saved student records and preserving lap snapshots.

## Inactive runners

Inactive runners remain in the roster but are excluded from active capture strips and completion counters. A scan matching an inactive runner is retained in the raw RFID audit log with `INACTIVE_RUNNER` and no accepted lap; it is not silently treated as unknown.

## Roster editing behaviour

The internal `editRoster` routine validates edits using the same V2 rules, rejects duplicate normalised tags or runner numbers, autosaves valid changes, and does not delete session history. During an active session it requires confirmation and explains that future scans use updated tags while prior raw events and accepted-lap snapshots remain unchanged.

## Known Stage 4A limitation

Offsets are stored and copied into accepted-lap records, but `adjusted_elapsed_ms` intentionally remains equal to raw elapsed timing. Offset timing calculations are reserved for Stage 4B.

## Roster storage correction

Stage 4A stores V2 saved rosters only under `runTimingRosterV2` using an envelope with `schema`, `schemaVersion`, `savedAtWallTimeIso`, and `students`. It never overwrites, rewrites, or deletes `runTimingRosterV1`. Startup prefers a valid V2 envelope; only when the V2 record is absent does it read V1 as a legacy fallback, migrate it in memory, and save the migrated roster to V2 while leaving the original V1 bytes unchanged. Invalid V1 data is never rewritten or deleted.
