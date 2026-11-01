# REA for modders

REA (`rea-agents` on npm, MIT, github.com/morluto/rea) is one MCP server that drives Ghidra, Hopper or
IDA for native code and has its own analysers for .NET, JavaScript/Electron, Android, archives,
firmware and live browser/Electron/process capture. Underhood uses it as an external dependency; it
is not bundled.

Use the connected server's actual tool list: a newer REA may have tools this page doesn't name, an
older one may lack some. Ghidra (Apache-2.0), JADX and similar engines are bring-your-own.

## Connect only when needed

- Tools present (`mcp__rea__*`): go straight to the target. No doctor/setup before every task.
- Tools missing: `npx -y rea-agents@latest doctor --client claude_code --json`. Missing registration →
  `npx -y rea-agents@latest setup --client claude_code --dry-run --json`, show the user the paths and
  changes, apply with `--yes` only after their OK, then restart the client. Setup never installs
  Node, Java, Ghidra or IDA.
- No MCP at all: most tools run as CLI, `npx -y rea-agents@latest <tool-name-with-dashes> ... --json`
  (e.g. `analyze-javascript-application /abs/path/app --json`). Same evidence rules.
- A call timed out on the client side: don't repeat it unchanged. Connection dropped: retry once only
  if the call is safe to repeat; otherwise ask the user to restart the MCP client.

## Tool map by question

| question | tools |
| --- | --- |
| what is this file / install folder? | `inspect_artifact` (archives, installers, PyInstaller, Godot pck), `inspect_binary_layout`, `inspect_pe_resources`, `inspect_signature`; app folders: `inspect_desktop_application` if advertised |
| open native code | `open_binary` → `binary_overview`, `binary_session` (provider, what's available) |
| find the function | `search_strings` → `xrefs` / `find_xrefs_to_name` → `procedure_pseudo_code`; `search_procedures`, `list_names` |
| understand it | `analyze_function` (dossier), `procedure_callers`, `procedure_callees`, `get_call_graph`, `build_call_path`, `resolve_native_call_targets`, `inspect_native_dispatch_metadata` (vtables, ObjC) |
| bytes and offsets | `read_bytes`, `address_to_file_offset`, `inspect_address_context`, `read_function_instructions` |
| name things as you learn | `set_address_name` / `set_addresses_names`, `set_comment`, `set_bookmark` (they persist in the analysis DB) |
| .NET / Mono | `inspect_managed_artifact`, `inspect_managed_members`, `inspect_managed_native_boundaries` (P/Invoke into native) |
| IL2CPP metadata | `inspect_il2cpp_metadata` if advertised (unencrypted `global-metadata.dat` only) |
| Electron / ASAR / web bundle | `analyze_javascript_application` (`detail: "summary"`), `trace_application_feature`, `recover_javascript_sources`, `analyze_web_bundle` |
| Android | `inspect_android_package`, `search_android_classes`, `inspect_android_method`, `trace_android_references` |
| what changed in a patch | `compare_application_versions`, `compare_artifacts`, `find_changed_behavior`, `compare_functions` |
| watch it run (user-owned, local) | `list_electron_targets` / `capture_electron_scenario`, `list_browser_targets` / `capture_browser_scenario`, `capture_process_scenario`, `observe_native_calls`, `trace_native_values`, `correlate_static_and_runtime` |
| track open questions | `record_unknown`, `update_unknown`, `list_unknowns`, `verify_unknown_resolution` |
| finish | `export_evidence_bundle` to a chosen path, then `close_binary` |

Runtime tools launch or attach to the declared target only. Never point them at a game with
anti-cheat or at an online session (RULES).

## Summary first, page the rest

- Big targets: call with `detail: "summary"`, then read only the section you need with
  `inspect_analysis_view` and the returned `parent_evidence_id` (facets, offsets, limits, `fields`).
- A result too big for the transport (`resource_constraint`): page it with `inspect_analysis_view`, or
  `export_evidence_bundle` to disk and grep. Don't re-run the producer to get the same data.
- Lost the parent ID: `get_evidence_bundle` with `detail: "summary"` and exact filters.
- One session per target. Check `binary_session` before opening again.

## Evidence rules

- Each result is an Evidence record with an `evidence_id`, coverage and limitations. Cite the ID next
  to every conclusion in `MODLOG.md`.
- Keep three buckets: observed (in the record), inferred (your reading), unknown (record it).
- Pseudocode and addresses are analysis output, not source. Static results never prove what ran;
  confirm with a breakpoint, a Frida hook, a log line or a REA runtime capture.
- Partial coverage means "not found in what was searched", never "absent".

## Bigger investigations

Write the questions as a checklist, each with the evidence it needs. Reuse open sessions and saved
analysis. Start from the smallest overview, follow one question from entry point to effect, batch
calls around one hypothesis. Split independent questions across subagents, each pointed at existing
Evidence IDs and asked to return conclusions plus gaps. Before finishing, mark every question
answered, partial or open.
