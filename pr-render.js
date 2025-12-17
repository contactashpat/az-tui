import chalk from "chalk";
import Table from "cli-table3";
import inquirer from "inquirer";
import openBrowser from "open";

import { formatBranch, getApprovalStatus, wrapText } from "./pr-format.js";
import { constructPrUrl } from "./pr-service.js";

export async function showTable(prs, condensed = false) {
  const table = new Table({
    head: [
      chalk.blue("Index"),
      chalk.green("ID"),
      chalk.yellow("Title"),
      chalk.white("Created By"),
      ...(condensed
        ? [chalk.cyan("Approval")]
        : [
            chalk.magenta("Branches"),
            chalk.cyan("Approval"),
          ]),
    ],
  });

  let index = 1;
  for (const pr of prs) {
    const approval = getApprovalStatus(pr);
    const createdBy = pr.createdBy?.displayName || "-";
    const wrappedTitle = wrapText(pr.title);
    const coloredTitle =
      pr.status === "active" ? chalk.green(wrappedTitle) : chalk.yellow(wrappedTitle);
    const baseRow = [
      index,
      chalk.bold(pr.pullRequestId),
      coloredTitle,
      createdBy,
    ];

    if (condensed) {
      table.push([...baseRow, approval]);
    } else {
      table.push([
        ...baseRow,
        `${formatBranch(pr.sourceRefName)} → ${formatBranch(pr.targetRefName)}`,
        approval,
      ]);
    }
    index++;
  }

  console.log(table.toString());
}

export async function showPRDetails(pr) {
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

  const { openInBrowser } = await inquirer.prompt({
    type: "confirm",
    name: "openInBrowser",
    message: "Open this PR in your browser?",
    default: false,
  });
  if (openInBrowser) openBrowser(await constructPrUrl(pr));
}
