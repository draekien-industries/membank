# Core — Alignment

## Scope (deprecated)

The `scope` column on the `memories` table — a raw SHA-256 hash of the git remote URL or cwd, written at save time. Replaced by the `projects` table + `memory_projects` join table. Existing rows with a non-`"global"` scope value must be migrated: a Project record is upserted for each distinct hash, and a corresponding Association is created for each memory. Rows with `scope = "global"` become Global Memories (no associations). The column is dropped after migration.

## Association

The relationship between a memory and a project. Adding an association links a memory to a project (it appears in that project's group). Removing an association unlinks it. A memory with no associations is a Global Memory. Adding/removing associations is the correct term for what the UI calls "move" — there is no exclusive transfer of ownership.

## Global Memory

A memory with no project associations. Applies across all contexts. Displayed under a "Global" group in the dashboard.

## Project

A first-class entity representing a working directory on a machine (source-controlled or not). Identified internally by a hash of its git remote URL (if present) or its absolute path. Has a human-readable name auto-derived from the repo name or directory name, which the user can rename. A project has many memories; a memory can belong to many projects.
