#!/usr/bin/env python3
"""Underhood progress file. Standard library only.

One small JSON file, underhood/state.json, so any session resumes without
re-reading MODLOG.md or the decomp folder.

    state.py init --target "Terraria" --kind game --idea "homing missile launcher"
    state.py show
    state.py set engine "XNA/FNA, .NET"
    state.py set saves "C:/Users/me/Documents/My Games/Terraria"
    state.py done recon --next underhood-dig
    state.py unknown "where is boss HP written?"
    state.py resolve 1 "NPC.StrikeNPC, verified with a breakpoint"
"""

import argparse
import datetime as dt
import json
import os
import sys

STEPS = ["recon", "dig", "forge", "art", "ship"]
KINDS = ["game", "app"]


def path_for(root):
    return os.path.join(root, "underhood", "state.json")


def load(root):
    p = path_for(root)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(root, state):
    p = path_for(root)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    state["updated"] = dt.date.today().isoformat()
    with open(p, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
        f.write("\n")


def new_state(target, kind, idea):
    return {
        "target": target,
        "kind": kind,
        "idea": idea,
        "step": "recon",
        "done": [],
        "next": "underhood-recon",
        "facts": {},
        "unknowns": [],
    }


def summary(state):
    open_unknowns = [u for u in state.get("unknowns", []) if not u.get("resolved")]
    lines = [
        "target: %s (%s)  idea: %s" % (state.get("target"), state.get("kind"), state.get("idea") or "-"),
        "step:   %s   done: %s" % (state.get("step"), ", ".join(state.get("done")) or "-"),
        "next:   %s" % state.get("next"),
    ]
    facts = state.get("facts", {})
    for k in list(facts)[:6]:
        lines.append("  %s: %s" % (k, facts[k]))
    if len(facts) > 6:
        lines.append("  (+%d more facts)" % (len(facts) - 6))
    for u in open_unknowns[:3]:
        lines.append("  ? %d %s" % (u["id"], u["text"]))
    if len(open_unknowns) > 3:
        lines.append("  (+%d more unknowns)" % (len(open_unknowns) - 3))
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Underhood progress file (underhood/state.json)")
    ap.add_argument("--root", default=".", help="project folder (default: current)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("init")
    p.add_argument("--target", required=True)
    p.add_argument("--kind", choices=KINDS, default="game")
    p.add_argument("--idea", default="")
    p.add_argument("--force", action="store_true")
    sub.add_parser("show")
    p = sub.add_parser("set")
    p.add_argument("key")
    p.add_argument("value")
    p = sub.add_parser("done")
    p.add_argument("step", choices=STEPS)
    p.add_argument("--next", default="")
    p = sub.add_parser("unknown")
    p.add_argument("text")
    p = sub.add_parser("resolve")
    p.add_argument("id", type=int)
    p.add_argument("answer")
    a = ap.parse_args(argv)

    state = load(a.root)
    if a.cmd == "init":
        if state and not a.force:
            print("exists: %s (use --force to start over)" % path_for(a.root))
            print(summary(state))
            return 1
        state = new_state(a.target, a.kind, a.idea)
        save(a.root, state)
        print(summary(state))
        return 0
    if state is None:
        print("no underhood/state.json here: run state.py init --target NAME")
        return 1
    if a.cmd == "show":
        print(summary(state))
    elif a.cmd == "set":
        state["facts"][a.key] = a.value
        save(a.root, state)
        print("set %s" % a.key)
    elif a.cmd == "done":
        if a.step not in state["done"]:
            state["done"].append(a.step)
        state["next"] = a.next or state.get("next", "")
        later = [s for s in STEPS if s not in state["done"]]
        state["step"] = later[0] if later else "finished"
        save(a.root, state)
        print(summary(state))
    elif a.cmd == "unknown":
        uid = max([u["id"] for u in state["unknowns"]] or [0]) + 1
        state["unknowns"].append({"id": uid, "text": a.text, "resolved": None})
        save(a.root, state)
        print("unknown %d recorded" % uid)
    elif a.cmd == "resolve":
        for u in state["unknowns"]:
            if u["id"] == a.id:
                u["resolved"] = a.answer
                save(a.root, state)
                print("unknown %d resolved" % a.id)
                return 0
        print("no unknown %d" % a.id)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
