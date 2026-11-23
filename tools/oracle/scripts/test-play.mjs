// npm run test:play: the full client_fr_play.swf replay test (20 goldens, ~3.5 min).
import { spawnSync } from "node:child_process";
const r = spawnSync(process.execPath, ["--test", "tools/oracle/test/play.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, MT_PLAY_FULL: "1" },
});
process.exit(r.status ?? 1);
