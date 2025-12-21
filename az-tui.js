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
    const { choice } = await inquirer.prompt([
      {
        type: "list",
        name: "choice",
        message: "Where do you want to go?",
        choices: [
          { name: "1) Pull Requests", value: "prs" },
          { name: "2) Board Tasks", value: "board" },
          { name: "Exit", value: "exit" },
        ],
      },
    ]);

    if (choice === "exit") {
      console.log(chalk.green("Goodbye!"));
      return;
    }

    try {
      if (choice === "prs") {
        await runScript("pr-interactive.js");
      } else if (choice === "board") {
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
