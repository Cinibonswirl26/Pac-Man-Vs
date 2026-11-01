#!/usr/bin/env bash
# SessionStart (cloud sessions only): fetch the modding and reverse-engineering toolkits whose skills are copied into
# .claude/skills, at pinned versions, and put their command lines on PATH for the session:
#   um  - Universal Modder (github.com/rehan-remade/universal-modder), its knowledge base in $UM_ROOT/knowledge
#   uh  - Underhood (github.com/Bambeek/underhood-skill)
#   rea - REA, Reverse Engineer Anything (npm rea-agents), run on its own Node 24 (it refuses older Node)
# On your own computer, install the plugins instead (see .claude/vendor/README.md); this script does nothing there.
# Everything goes under ~/.cache/modding-tools and is skipped when already there. Failures never block the session.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
set -u
C="$HOME/.cache/modding-tools"; mkdir -p "$C"
UM_REV=9811709d950979f1b5012dddf10b7ec122d7e95e
UH_REV=6ebac3b7809bbb356b9027bc982d54ab0d7b12f5
REA_VER=6.8.0
NODE_VER=24.22.2
log() { echo "[modding-tools] $*" >&2; }
fetch() {   # repo url, pinned commit, dest
  [ "$(git -C "$3" rev-parse HEAD 2>/dev/null)" = "$2" ] && return 0
  rm -rf "$3.tmp" && git init -q "$3.tmp" && git -C "$3.tmp" fetch -q --depth 1 "$1" "$2" && git -C "$3.tmp" checkout -q FETCH_HEAD \
    && rm -rf "$3" && mv "$3.tmp" "$3" || { log "could not fetch $1"; rm -rf "$3.tmp"; return 1; }
}
fetch https://github.com/rehan-remade/universal-modder "$UM_REV" "$C/universal-modder" &
fetch https://github.com/Bambeek/underhood-skill "$UH_REV" "$C/underhood" &
NODE="$C/node-v$NODE_VER-linux-x64/bin/node"
if [ ! -x "$NODE" ]; then
  curl -fsSL "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-linux-x64.tar.xz" | tar -xJ -C "$C" || log "could not fetch Node $NODE_VER"
fi
if [ -x "$NODE" ] && [ ! -f "$C/rea/node_modules/rea-agents/package.json" ]; then
  mkdir -p "$C/rea" && (cd "$C/rea" && PATH="$(dirname "$NODE"):$PATH" npm install --silent --no-audit --no-fund "rea-agents@$REA_VER") >/dev/null 2>&1 || log "could not install rea-agents@$REA_VER"
fi
wait
mkdir -p "$C/bin"
[ -f "$C/rea/node_modules/rea-agents/scripts/rea.mjs" ] && printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' "$NODE" "$C/rea/node_modules/rea-agents/scripts/rea.mjs" > "$C/bin/rea" && chmod +x "$C/bin/rea"
if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -qs "modding-tools-path" "$CLAUDE_ENV_FILE"; then
  printf 'export PATH="%s/bin:%s/universal-modder/bin:%s/underhood/bin:$PATH" UM_ROOT="%s/universal-modder" UH_ROOT="%s/underhood"  # modding-tools-path\n' "$C" "$C" "$C" "$C" "$C" >> "$CLAUDE_ENV_FILE"
fi
log "ready: um, uh, rea (Ghidra is not installed: REA's native decompiling needs it)"
exit 0
