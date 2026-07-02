-- Per-table import metadata: ClubGG "Game Detail" / "Game Statistics" reports
-- are per-table, and the daily workflow is one export file per table. Record
-- which file a session came from and which table/game each line belongs to,
-- so the economy ledger can be tracked per table per day.

alter table pa_import_sessions add column source_file text;
alter table pa_import_lines add column table_name text;
alter table pa_import_lines add column game_type text;
