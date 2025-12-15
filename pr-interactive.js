#!/usr/bin/env node

import chalk from "chalk";
import inquirer from "inquirer";
import Table from "cli-table3";
import { spawn } from "child_process";
import openBrowser from "open";

// Helper that runs a command with explicit args (no shell) and returns stdout.
async function execSpawnAsync(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Command "${command} ${args.join(" ")}" exited with code ${code}: ${stderr.trim()}`));
      }
      resolve(stdout);
    });
  });
}

async function getAzDevOpsDefaults() {
  const stdout = await execSpawnAsync("az", ["devops", "configure", "--list"]);
  const lines = stdout.split("\n");
  const orgLine = lines.find((l) => l.trim().startsWith("organization"));
  const projectLine = lines.find((l) => l.trim().startsWith("project"));

  const organization = orgLine?.split("=")[1]?.trim();
  const project = projectLine?.split("=")[1]?.trim();
  return { organization, project };
}

async function fetchPRs(status = "active") {
  // Only allow known statuses to avoid injection via unexpected values.
  const allowed = ["active", "completed", "abandoned"];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status "${status}". Allowed: ${allowed.join(", ")}`);
  }
  const stdout = await execSpawnAsync("az", [
    "repos",
    "pr",
    "list",
    "--status",
    status,
    "--output",
    "json",
  ]);
  return JSON.parse(stdout);
}

async function constructPrUrl(pr) {
  const { organization: org, project: proj } = await getAzDevOpsDefaults();
  const repo = pr.repository?.name;
  const id = pr.pullRequestId;
  if (org && proj && repo && id) {
    return `${org}/${proj}/_git/${repo}/pullrequest/${id}`;
  }

  return "";
}

async function showTable(prs, condensed = false) {
  const table = new Table({
    head: [
      chalk.blue("Index"),
      chalk.green("ID"),
      chalk.yellow("Title"),
      ...(condensed
        ? [chalk.cyan("URL")]
        : [
            chalk.magenta("Branches"),
            chalk.cyan("URL"),
            chalk.white("Created By"),
          ]),
    ],
  });

  let index = 1;
  for (const pr of prs) {
    const url = await constructPrUrl(pr);
    const baseRow = [
      index,
      chalk.bold(pr.pullRequestId),
      pr.status === "active" ? chalk.green(pr.title) : chalk.yellow(pr.title),
    ];

    if (condensed) {
      table.push([...baseRow, chalk.underline(url)]);
    } else {
      table.push([
        ...baseRow,
        `${pr.sourceRefName.replace("refs/heads/", "")} → ${pr.targetRefName.replace("refs/heads/", "")}`,
        chalk.underline(url),
        pr.createdBy?.displayName,
      ]);
    }
    index++;
  }

  console.log(table.toString());
}

async function showPRDetails(pr) {
  console.log(chalk.bold(`\nDetails for PR #${pr.pullRequestId}`));
  console.log(chalk.green("Title:"), chalk.green(pr.title));
  console.log(chalk.yellow("Created By:"), pr.createdBy?.displayName);
  console.log(
    chalk.magenta("Source Branch:"),
    pr.sourceRefName.replace("refs/heads/", ""),
  );
  console.log(
    chalk.magenta("Target Branch:"),
    pr.targetRefName.replace("refs/heads/", ""),
  );
  console.log(
    chalk.cyan("Description:\n"),
    pr.description || "- no description -",
  );
  console.log(chalk.blue("Web URL:"), await constructPrUrl(pr));

  // Optionally open in browser
  const { openInBrowser } = await inquirer.prompt({
    type: "confirm",
    name: "openInBrowser",
    message: "Open this PR in your browser?",
    default: false,
  });
  if (openInBrowser) openBrowser(await constructPrUrl(pr));
}

async function mainMenu(prs) {
  while (true) {
    const { action } = await inquirer.prompt({
      type: "list",
      name: "action",
      message: "Select an action",
      choices: [
        "1) View PR Details",
        "2) Show Less Fields",
        "3) Filter by Created By",
        "4) Filter by Reviewer",
        "5) Refresh PR List",
        "q) Exit",
      ],
    });

    switch (action[0]) {
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
      case "2":
        await showTable(prs, true);
        break;
      case "3": {
        const { pattern } = await inquirer.prompt({
          type: "input",
          name: "pattern",
          message: "Enter regex to filter by Created By:",
        });
        prs = prs.filter((pr) =>
          new RegExp(pattern, "i").test(pr.createdBy?.displayName),
        );
        await prs;
        break;
      }
      case "4": {
        const { pattern } = await inquirer.prompt({
          type: "input",
          name: "pattern",
          message: "Enter regex to filter by Reviewer:",
        });
        prs = prs.filter((pr) =>
          pr.reviewers?.some((r) =>
            new RegExp(pattern, "i").test(r.displayName),
          ),
        );
        await showTable(prs);
        break;
      }
      case "5": {
        console.log(chalk.blue("\nRefreshing PR list…"));
        prs = await fetchPRs();
        await showTable(prs);
        break;
      }
      case "q":
      case "Q":
        console.log(chalk.green("Goodbye!"));
        process.exit(0);
    }
  }
}
(async () => {
  try {
    const prs = await fetchPRs();
    await showTable(prs);
    await mainMenu(prs);
  } catch (err) {
    console.error(chalk.red("Error:"), err.message);
  }
})();
