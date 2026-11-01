# Modding and reverse-engineering tools for Claude

Copies of three open-source Claude Code toolkits' skills, kept in the repository because cloud sessions load a
repository's `.claude/skills/` and `.claude/agents/` but do not install plugins. Their command lines are fetched by
`.claude/hooks/modding-tools.sh` (pinned below), which puts them on the PATH. It runs at session start once it is
registered as a SessionStart hook in `.claude/settings.json`, or it can go in the cloud environment's setup script;
until then, run `bash .claude/hooks/modding-tools.sh` in a session (with CLAUDE_CODE_REMOTE=true) to set them up.

| Toolkit | Source and version | Here | Command |
|---|---|---|---|
| Universal Modder | github.com/rehan-remade/universal-modder at `9811709` | skills: asset-pipeline, blitz3d-decomp, fal-assets, game-automation, game-recon, game-research-websearch, mashup-mods, mod-any-game, port-a-mod, publish-mod, reverse-engineering, share-field-notes, showcase-video; agents: mod-orchestrator, mod-game-worker, mod-offline-worker | `um` (its knowledge base: `$UM_ROOT/knowledge`) |
| Underhood | github.com/Bambeek/underhood-skill at `6ebac3b` | skills: underhood-recon, underhood-dig, underhood-forge, underhood-art, underhood-ship (with underhood-shared) | `uh` |
| REA, Reverse Engineer Anything | npm `rea-agents` 6.8.0 (github.com/morluto/rea) | skill: reverse-engineer-anything | `rea` (its MCP server is not registered in cloud sessions; the command line has the same commands) |

All three are MIT-licensed; their licences are in `licenses/`. The skills are unchanged copies.

Limits in this cloud environment:
- REA's native decompiling needs Ghidra 12.1, which is not installed: the environment's network policy blocks
  GitHub release downloads. Allowing them (or adding Ghidra to the environment's setup script) would enable it.
- Universal Modder's asset generation (fal) needs a paid `FAL_KEY`; nothing here sets one.

On your own computer, install the plugins instead (the session-start script does nothing outside cloud sessions):

```
/plugin marketplace add rehan-remade/universal-modder
/plugin install universal-modder@universal-modder
/plugin marketplace add morluto/rea
/plugin install rea@rea
/plugin marketplace add Bambeek/underhood-skill
/plugin install underhood@underhood
```

To update: change the pinned commit or version in `.claude/hooks/modding-tools.sh` and copy the matching skills here.
