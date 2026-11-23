# SDD ledger — plan: docs/superpowers/plans/2026-11-23-etape3-missions-raids-parrainage.md
Branch etape3 (from main 3fd2b47); plan commit a3364c6. Spec: docs/superpowers/specs/2026-11-22-minitroopers-remake-design.md (approved).
User final deliverable (2026-11-23): only after stage 3 AND stage 4 are done (chain stage 4 right after stage 3; no stop between), spin up a temporary instance on this LXC (http://192.168.1.120:8080/, LISTEN_HOST=0.0.0.0) with the brother's army (create-bro-army) and give the user URL + army name + password. Army name: asked user, not yet given — else placeholder. Rules: French to user, no pkill -f, ask before merge/push main; pushing etape3 OK.

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1→T6 | fixtures modes/*.json → buildModeInput test reconstructs them | consistent |
| T2→T6/T7/T8 | npc/rats/raid/missions/seeds signatures | names consistent (dayRats, ratArmy, npcArmy, raidPower, raidTrooperRange, epicPower, missionOfDay, pickInfiltrationTarget, seedsOffering) |
| T3→T4/T5/T8 | migration 005 columns (created_cid, rats, missions_unlocked, recruit_*), deleteArmy, persistSession, sameOrigin | consistent |
| T4→T6/T7 | confirmedRecruitCount / recruits confirmed → missionOfDay recruits, raidRecruits | consistent |
| T6→T7 | NewModeBattle, ModeResult, buildModeInput, modeBattleOfDay | consistent |
| T3/T5 | sameOrigin + chk on /protect | consistent |
| each task self-consistency | T1..T9 tests vs code text | agree; T8 test name "Les Frangins" is an example only |
Scan clean.
Ruling: implementer models — opus for T1 (possible engine debugging), T6, T7 (multi-file integration); sonnet for T2–T5, T8, T9; reviewers sonnet, final review opus — cost-vs-risk — if wrong, more fix rounds.

Task 1: dispatched (base a3364c6, implementer opus)
Task 1: complete (commits a3364c6..163a974, review clean)
Task 1: minor (deferred): import-modes.ts:46 winner regex heuristic (/remport|won|successful/) — throw on unknown endMsg
Task 1: minor (deferred): import-modes.ts not typechecked (consistent with other scripts); default recon path outside repo
Task 2: dispatched (base 163a974, sonnet)
Task 2: complete (commits 163a974..6df866c, review clean)
Task 2: minor (deferred): seeds.ts:8 seedsOffering unbounded loop on never-offered skill
Task 2: minor (deferred): stage3.test.ts weak determinism assert (m(10) vs itself); fought-bias of pickInfiltrationTarget untested; rat seeds < NPC_SEED_MAX unasserted
Task 2: minor (deferred): {...defaultPref(), leftOver: []} duplicated rats.ts:30 / npc.ts:40; raidPower/epicPower no clamp for phase<1 / wins<0
Task 2: minor (deferred): one stage3.test.ts instead of 5 test files; TDD RED produced after the fact
Task 3: dispatched (base 6df866c, sonnet)
Ruling: subagent commits may carry 'Claude Sonnet 5.5' Co-Authored-By (their own harness attribution) instead of Opus 5.5 — trailer reflects the model that wrote it — cost if wrong: cosmetic trailer mismatch
Ruling (supersedes previous trailer ruling): commits must carry `Co-Authored-By: Claude Opus 5.5` exactly per Global Constraints, whatever the subagent's own harness reminder says — the constraint is explicit — cost if wrong: none
Task 3: review — spec ❌ (trailer; 302 vs 303; lazy-session test shape; extra double-submit fallback too broad; wider err=stale) + Important trailer → fix round 1
Task 3: minor (deferred): isSessionKey ignores persisted; AUTOINCREMENT high-water mark not kept by 005 rebuild; migrate() re-check done after BEGIN IMMEDIATE; friend-attack replay URL inconsistency (fview vs view/bat, pre-existing)
Task 3: fix round 1/5 (6 addressed, 0 open — trailer, 303, lazy-session test, narrow double-submit, narrow err=stale, README PUBLIC_URL; commits 5e69af2..78b877d; 7dbf398 rewritten as 5e69af2, trailer only)
Task 3: minor (deferred): home.test.ts re-submit last assert accepts 409|400|302 (loose)
Task 3: complete (commits 6df866c..78b877d, review clean)
Task 4: dispatched (base 78b877d, sonnet)
Task 4: complete (commits 78b877d..8628d41, review clean)
Task 4: minor (deferred): bounty rank shifts if a recruit is deleted (not in unverified.md); raw SQL in routes/history.ts:19; concurrent-GET test can't catch races (sync sqlite); <ul class="history"> alone in hq view
Task 5: dispatched (base 8628d41, sonnet)
Task 5: complete (commits 8628d41..696dbd1, review clean)
Task 5: minor (deferred): protect.test stranger case never reaches ownedArmy (wrong chk), loose 302||403; ERR_RATE/missingPage 429 duplicated protect.ts/hq.ts; sessions unbound on creation too (documented)
Task 6: dispatched (base 696dbd1, opus)
Task 6: complete (commits 696dbd1..020a9c6, review clean)
Task 6: minor (deferred): raw INSERT INTO notices in routes/mission.ts /b/unlock; infiltration <h1> on one line vs original word-per-line; BG helper duplicated views/mission.ts:31 & views/hq.ts; asMissionType silent fallback; concurrency tests serialized (no 2nd connection); midnight test doesn't assert the new day's draw; mission salt fixed string "missions" (no server secret)
Task 7: dispatched (base 020a9c6, opus)
Task 7: implementer hit API 529 before any change (tree clean at 020a9c6); resumed same agent
Task 7: complete (commits 020a9c6..30cf8ca, review clean)
Task 7: minor (deferred): dead-recruit filter written twice repo.ts:152-172; NewModeBattle.phase unused; 20th-win endMsg promises a next raid (archived text); phase URLs/view keyed on current day (first-view animation lost across midnight; same for missions); tests tuned on seeds 42/4242; .rcount tooltip &amp;#39; vs archived \'; HQ raid link adds phase=N (constraint)
Task 8: dispatched (base 30cf8ca, sonnet)
Task 8: complete (commits 30cf8ca..d8e3221, review clean)
Task 8: minor (deferred): CLI faction-refusal message unreachable (checkArmyName rejects faction names first); 35-rats test uses builder not route; values.troopers! non-null asserts
Task 9: dispatched (base d8e3221, sonnet)
Task 9: concern — e2e plays the drawn mission type only (no epic), raid phase 1 only; oracle 1630 OK/0 KO; etape3 pushed
Task 9: complete (commits d8e3221..2a9a271, review clean)
Task 9: minor (deferred): e2e "seen replay" comment says no reward link but doesn't assert; raid chaining to phase 2 not in e2e; original-game.md section in French in an English file
Final review: dispatched (range 3fd2b47..2a9a271, opus)
Final review: With fixes — Important: (1) first /protect password settable by anyone on created_cid NULL armies; (2) 005 lacks indexes armies(recruiter_id), battles(defender_id). Minor: (3) lost-tile tooltip JS SyntaxError (s'est); (4) battle at 23:59:59 view lost after midnight; (5) rats uncapped; (6) 403 page gives no PUBLIC_URL hint. Ledger minors: none blocking.
Ruling: fix wave covers 1–6 (4–6 are cheap and bite the user's demo/self-host); rats cap = 100 (= RAID_PER_BATTLE/EPIC_NPC_MAX scale, UNVERIFIED) — cost if wrong: a very long-time player stops gaining rats past 100
Final fix wave: dispatched (base 2a9a271, opus)
Final fix wave: commits 2a9a271..751d1e0 (6 findings fixed, 460 tests, pushed). Deferred to stage 4: /b/view/bat<n> same midnight bug (stage-2 code).
Final fix wave re-review: all 6 addressed, no new breakage. Out-of-scope → stage 4: regular battle midnight view bug; rats>100 pre-existing armies get clamped. STAGE 3 COMPLETE (head 751d1e0, pushed).
