---
name: install-voice-channel
description: Bootstrap the /add-voice-channel skill into a NanoClaw checkout. Run this once from the nanoclaw-voice-channel checkout — it copies the add-voice-channel SKILL.md into the target nanoclaw's .claude/skills/, after which /add-voice-channel works there exactly like /add-discord (analog flow).
---

# Bootstrap /add-voice-channel into NanoClaw

This skill exists because `/add-voice-channel` SKILL.md is not yet in
upstream `qwibitai/nanoclaw`. Until that PR lands, the skill ships from
this repo. This bootstrapper does the one-time hand-off so a NanoClaw
checkout has the skill discoverable for future runs.

## When to run this

- You have a NanoClaw checkout (carstenf or upstream).
- You have this `nanoclaw-voice-channel` checkout.
- You want voice-channel integration in your NanoClaw.

Run this skill **from the `nanoclaw-voice-channel` checkout** (cwd =
this repo). It writes into the NanoClaw target you specify.

## Phase 1: Locate the NanoClaw target

Use `AskUserQuestion`:

- **Where is your NanoClaw checkout?**
  - Default `~/nanoclaw`. Accept "Other" for an explicit path.

Validate the target:

```bash
test -f "$NANOCLAW_DIR/package.json" && grep -q '"nanoclaw"' "$NANOCLAW_DIR/package.json"
```

If validation fails, abort with a message pointing at
[`qwibitai/nanoclaw`](https://github.com/qwibitai/nanoclaw) for the
upstream clone instructions.

## Phase 2: Copy the add-voice-channel SKILL.md

```bash
mkdir -p "$NANOCLAW_DIR/.claude/skills/add-voice-channel"
cp "$PWD/.claude/skills/add-voice-channel/SKILL.md" \
   "$NANOCLAW_DIR/.claude/skills/add-voice-channel/SKILL.md"
```

(`$PWD` is the nanoclaw-voice-channel checkout you're running this from.)

## Phase 3: Hand off

Tell the user:

> The `/add-voice-channel` skill is now installed in `$NANOCLAW_DIR/.claude/skills/`.
>
> To complete the install:
>
> ```bash
> cd $NANOCLAW_DIR
> ```
>
> Then run `/add-voice-channel` — it works the same way `/add-discord`
> does (git remote add + merge + apply trunk patches + configure
> environment + smoke test). The actual voice content (3 trunk-side files)
> comes via the merge from `voice/pattern-b`.

Optionally, if the user wants this bootstrap committed to the NanoClaw
trunk (so it's there on next clone of their fork):

```bash
cd $NANOCLAW_DIR
git add .claude/skills/add-voice-channel/SKILL.md
git commit -m "skill: add /add-voice-channel install recipe (bootstrapped from nanoclaw-voice-channel)"
```

This is optional. If the user prefers to keep their NanoClaw fork close
to upstream (no fork-only skill files), skip the commit; the SKILL.md
just lives untracked in `.claude/skills/` for that local install.

## Why this two-stage?

Discord's pattern works because `/add-discord` SKILL.md ships in
upstream `qwibitai/nanoclaw`. Until the analogous voice PR lands
upstream, the SKILL.md ships here, and a one-time bootstrap step is
needed to make it discoverable in a NanoClaw checkout. After bootstrap,
`/add-voice-channel` is identical in behavior to `/add-discord`.

When the upstream PR lands, this `install-voice-channel` skill becomes
unnecessary — `/add-voice-channel` will be in upstream just like
`/add-discord`, and users can skip Phase 1+2 entirely.
