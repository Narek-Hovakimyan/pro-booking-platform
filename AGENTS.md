TOKEN_EFFICIENCY_MODE=ON

Project rules:

* Read only the minimum files needed.
* Do not scan the whole repository unless explicitly requested.
* Ignore `node_modules`, `dist`, `build`, `coverage`, `.git`, logs, and generated files.
* Do not create or update task_progress/progress/checklist/status files.
* Do not commit.
* Do not push.
* Do not rewrite unrelated code.
* Keep changes narrow and audit-first.
* Return diffs or changed-file summaries, not full files.
* Summarize logs over 100 lines.
* If tests fail, show only the relevant failing part.
* Keep responses short unless a full report is requested.

Output format:

* files reviewed
* files changed
* issue found
* fix made
* command results
* git status summary
* merge-ready true/false
OUTPUT_COMPRESSION_MODE=ON

During work:
- Do not stream progress updates.
- Do not narrate what you are doing.
- Do not list files while working.
- Do not show intermediate thoughts.
- Do not show command output unless it failed.
- Do not print full logs.
- Only show final report.

Final report must be short:
- files changed
- fix made
- tests
- merge-ready

If a command passes, write only:
- `passed`

If a command fails, show only:
- command
- error summary
- last 30 relevant lines