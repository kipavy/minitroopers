import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FightResult } from "../domain-types";
import type { BattleOutcome } from "./types";

export interface CombatSimulatorConfig {
  swfPath: string;
  rufflePath: string;
  maxConcurrent: number;
  timeoutMs: number;
}

const findMonorepoRoot = (): string => {
  let current = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (
      existsSync(join(current, "apps", "server")) &&
      existsSync(join(current, "packages", "shared"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return process.cwd();
};

const defaultConfig = (): CombatSimulatorConfig => {
  const root = findMonorepoRoot();
  const isWindows = process.platform === "win32";
  return {
    swfPath: join(
      root,
      "apps/client/src/assets/swf/client_fr_edit.swf",
    ),
    rufflePath: join(
      root,
      "apps/server/src/bin",
      isWindows ? "ruffle_desktop.exe" : "ruffle_desktop",
    ),
    maxConcurrent: 20,
    timeoutMs: 35_000,
  };
};

let config: CombatSimulatorConfig = defaultConfig();

export const configureCombatSimulator = (
  partial: Partial<CombatSimulatorConfig>,
): void => {
  config = { ...config, ...partial };
};

export const getCombatSimulatorConfig = (): CombatSimulatorConfig => ({
  ...config,
});

export class RuffleBattleSimulator {
  private runningProcesses = 0;
  private queue: Array<() => void> = [];

  async runBattle(flashvars: string): Promise<BattleOutcome> {
    await this.waitForSlot();

    return new Promise((resolve, reject) => {
      let graveyard: number[] | null = null;
      let battleResult: number | null = null;
      let slotReleased = false;
      let child: ChildProcess | undefined;

      const safeReleaseSlot = () => {
        if (!slotReleased) {
          slotReleased = true;
          this.releaseSlot();
        }
      };

      const cleanup = (timeoutId?: NodeJS.Timeout) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (child?.pid) {
          try {
            if (process.platform === "win32") {
              process.kill(child.pid);
            } else {
              process.kill(-child.pid);
            }
          } catch {
            // process may already be gone
          }
        }
      };

      const checkResults = (timeoutId: NodeJS.Timeout) => {
        if (battleResult !== null && graveyard !== null) {
          cleanup(timeoutId);
          safeReleaseSlot();
          resolve({
            graveyard,
            result: (battleResult === 0 ? "win" : "lose") as FightResult,
          });
        }
      };

      const flashvarsDecoded = decodeURIComponent(flashvars);

      if (!existsSync(config.swfPath)) {
        safeReleaseSlot();
        reject(
          new Error(
            `Combat SWF not found at "${config.swfPath}". Deploy client assets or configureCombatSimulator().`,
          ),
        );
        return;
      }

      if (!existsSync(config.rufflePath)) {
        safeReleaseSlot();
        reject(
          new Error(
            `Ruffle binary not found at "${config.rufflePath}".`,
          ),
        );
        return;
      }

      if (process.platform === "win32") {
        child = spawn(config.rufflePath, [
          config.swfPath,
          "-P",
          flashvarsDecoded,
          "--dummy-external-interface",
        ]);
      } else {
        child = spawn(
          "xvfb-run",
          [
            "-a",
            config.rufflePath,
            config.swfPath,
            "-P",
            flashvarsDecoded,
            "--dummy-external-interface",
          ],
          { detached: true },
        );
      }

      const timeoutId = setTimeout(() => {
        cleanup(timeoutId);
        safeReleaseSlot();
        reject(new Error("Battle simulation timed out"));
      }, config.timeoutMs);

      child.stdout?.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (!line.includes("battleResult")) {
            continue;
          }

          const listMatch = line.match(/List\(\[(.*?)\]\)/);
          if (listMatch) {
            const content = listMatch[1];
            const numMatches = content.match(/Number\(([\d.]+)\)/g);
            graveyard = numMatches
              ? numMatches.map((n: string) =>
                  parseFloat(n.match(/[\d.]+/)![0]),
                )
              : [];
            checkResults(timeoutId);
            continue;
          }

          const number = line.match(/Number\(([\d.]+)\)/);
          if (number) {
            battleResult = parseInt(number[1], 10);
            checkResults(timeoutId);
          }
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        if (/error/i.test(output)) {
          console.error("[combat/ruffle] stderr:", output.slice(0, 500));
        }
      });

      child.once("error", (err: Error) => {
        cleanup(timeoutId);
        safeReleaseSlot();
        reject(new Error(`Failed to start Ruffle process: ${err.message}`));
      });

      child.once("exit", (code: number | null) => {
        cleanup(timeoutId);
        if (code !== 0 && battleResult === null) {
          safeReleaseSlot();
          reject(new Error(`Ruffle process exited with code ${code}`));
        }
      });
    });
  }

  private async waitForSlot(): Promise<void> {
    if (this.runningProcesses < config.maxConcurrent) {
      this.runningProcesses++;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.runningProcesses++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    if (this.runningProcesses <= 0) {
      this.runningProcesses = 0;
      return;
    }

    this.runningProcesses--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

let defaultSimulator: RuffleBattleSimulator | null = null;

export const getRuffleBattleSimulator = (): RuffleBattleSimulator => {
  if (!defaultSimulator) {
    defaultSimulator = new RuffleBattleSimulator();
  }
  return defaultSimulator;
};
