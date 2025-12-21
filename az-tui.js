#!/usr/bin/env node

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import chalk from "chalk";
import inquirer from "inquirer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runScript(scriptName, args = []) {
  const scriptPath = resolve(__dirname, scriptName);
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: "inherit",
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        return rejectPromise(
          new Error(`${scriptName} exited with code ${code ?? "unknown"}`),
        );
      }
      resolvePromise();
    });
  });
}

async function mainMenu() {
  while (true) {
    console.log(chalk.blue("\nWhere do you want to go?"));
    console.log("  1) Pull Requests");
    console.log("  2) Board Tasks");
    console.log("  q) Exit");

    const { choice } = await inquirer.prompt([
      {
        type: "input",
        name: "choice",
        message: "Enter choice (1/2/q):",
      },
    ]);

    const normalized = choice.trim().toLowerCase();

    if (normalized === "q" || normalized === "quit" || normalized === "exit") {
      console.log(chalk.green("Goodbye!"));
      return;
    }

    let target = null;
    if (["1", "p", "pr", "prs"].includes(normalized)) target = "prs";
    else if (["2", "b", "board", "boards"].includes(normalized)) target = "board";

    if (!target) {
      console.log(chalk.yellow("Invalid choice. Please enter 1, 2, or q."));
      continue;
    }

    try {
      if (target === "prs") {
        await runScript("pr-interactive.js");
      } else if (target === "board") {
        await runScript("board-tasks.js", ["--wiql-file", "query.wiql", "--interactive"]);
      }
    } catch (err) {
      console.error(chalk.red(err.message || err));
    }
  }
}

(async () => {
  try {
    await mainMenu();
  } catch (err) {
    console.error(chalk.red("Error:"), err.message);
    process.exit(1);
  }
})();
