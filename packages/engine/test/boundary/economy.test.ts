import { test } from "node:test";
import assert from "node:assert/strict";
import { armyPower, recruitCost, trooperLevel, upgradeCost } from "../../src/index.ts";

test("recruitCost = Data.XP_LEVELS[count], null at 12 troopers", () => {
  assert.equal(recruitCost(1), 8);
  assert.equal(recruitCost(6), 340); // fr/add.html "Ajouter pour 340" with 6 troopers
  assert.equal(recruitCost(4), 120); // com/add.html "Add for 120" with 4 troopers
  assert.equal(recruitCost(11), 2000);
  assert.equal(recruitCost(12), null);
  assert.equal(recruitCost(0), 0);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(recruitCost),
    [8, 24, 60, 120, 200, 340, 500, 720, 1000, 1300, 2000],
  );
});

test("upgradeCost(n) = int((n+1)^2.5)", () => {
  assert.equal(upgradeCost(8), 243);
  assert.equal(upgradeCost(7), 181); // fr/t_0.html "Améliorer pour 181" (level 8)
  assert.equal(upgradeCost(0), 1);
  assert.equal(upgradeCost(14), 871);
});

test("armyPower = Σ(5 + choices.length); trooperLevel = 1 + choices.length", () => {
  assert.equal(armyPower([]), 0);
  assert.equal(armyPower([{ choices: [] }]), 5);
  assert.equal(armyPower([{ choices: [0, 1, 0] }, { choices: [-1] }]), 14);
  assert.equal(trooperLevel(0), 1);
  assert.equal(trooperLevel(7), 8);
});
