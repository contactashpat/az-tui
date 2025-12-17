#!/usr/bin/env node

import chalk from "chalk";
import inquirer from "inquirer";

import { fetchPRs } from "./pr-service.js";
import { showPRDetails, showTable } from "./pr-render.js";

function printMenu() {
  const menuLines = [
    "1) View PR Details",
    "2) Filter by Created By",
    "3) Refresh PR List",
    "h) Help (show options)",
    "q) Exit",
  ];
  console.log(chalk.blue("\nOptions:"));
  for (const line of menuLines) console.log(`  ${line}`);
}

async function mainMenu(prs) {
  await showTable(prs);
  console.log(chalk.blue("Press 'o' to view options, 'q' to quit."));

  while (true) {
    const { action } = await inquirer.prompt({
      type: "input",
      name: "action",
      message: "Select an option (number, h for help, q to quit):",
    });

    const normalized = action.trim().toLowerCase();

    if (normalized === "o" || normalized === "options") {
      printMenu();
      continue;
    }

    if (normalized === "h" || normalized === "help" || normalized === "?") {
      printMenu();
      continue;
    }

    switch (normalized) {
      case "1": {
        const { index } = await inquirer.prompt({
          type: "input",
          name: "index",
          message: "Enter the Index number of the PR to view details:",
          validate: (val) => {
            const num = parseInt(val);
            if (isNaN(num) || num < 1 || num > prs.length) {
              return "Must be a valid index number";
            }
            return true;
          },
        });
        await showPRDetails(prs[index - 1]);
        break;
      }
      case "2": {
        const { pattern } = await inquirer.prompt({
          type: "input",
          name: "pattern",
          message: "Enter regex to filter by Created By:",
        });
        prs = prs.filter((pr) =>
          new RegExp(pattern, "i").test(pr.createdBy?.displayName),
        );
        await showTable(prs);
        break;
      }
      case "3": {
        console.log(chalk.blue("\nRefreshing PR list…"));
        prs = await fetchPRs();
        await showTable(prs);
        break;
      }
      case "q":
        console.log(chalk.green("Goodbye!"));
        process.exit(0);
      default:
        console.log(chalk.red("Invalid option. Type 'h' for help."));
    }
  }
}

(async () => {
  try {
    const prs = await fetchPRs();
    await mainMenu(prs);
  } catch (err) {
    console.error(chalk.red("Error:"), err.message);
  }
})();
