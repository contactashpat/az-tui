#!/usr/bin/env node

import { exec } from "child_process";
import { promisify } from "util";
import Table from "cli-table3";
import chalk from "chalk";
import { Command } from "commander";
import openBrowser from "open";

const execAsync = promisify(exec);

const program = new Command();
program
  .option("-s, --status <status>", "PR status (active|completed|abandoned)", "active")
  .option("-c, --createdBy <regex>", "Filter by creator name regex")
  .option("-r, --reviewer <regex>", "Filter by reviewer name regex")
  .option("-o, --open <ids...>", "Open PR ID(s) in your browser")
  .parse(process.argv);

const options = program.opts();

// Helper: filter builder
const buildFilter = (value, fieldAccessor) => {
  const re = new RegExp(value, "i");
  return (pr) => re.test(fieldAccessor(pr) ?? "");
};

// Build a web URL for the PR
function constructPrUrl(pr) {
  const org = pr.repository.project?.name;
  const proj = pr.repository.project?.name;
  const repo = pr.repository?.name;
  const id = pr.pullRequestId;
  if (org && proj && repo && id) {
    return `https://dev.azure.com/${org}/${proj}/_git/${repo}/pullrequest/${id}`;
  }
  return "";
}

async function fetchPRs() {
  const cmd = `az repos pr list --status ${options.status} --output json --include-links`;
  const { stdout } = await execAsync(cmd);
  return JSON.parse(stdout);
}

(async () => {
  try {
    let prs = await fetchPRs();

    if (options.createdBy) {
      prs = prs.filter(buildFilter(options.createdBy, (pr) => pr.createdBy?.displayName));
    }

    if (options.reviewer) {
      prs = prs.filter((pr) =>
        pr.reviewers?.some((r) => new RegExp(options.reviewer, "i").test(r.displayName))
      );
    }

    if (!prs || !prs.length) {
      console.log(chalk.yellow("No pull requests found with the given filters."));
      return;
    }

    // If user asked to open specific IDs in browser
    if (options.open) {
      options.open.forEach((id) => {
        const match = prs.find((p) => String(p.pullRequestId) === id);
        if (match) {
          const url = constructPrUrl(match);
          if (url) openBrowser(url);
          else console.log(chalk.red(`No URL found for PR #${id}`));
        } else {
          console.log(chalk.red(`PR #${id} not found in the filtered list.`));
        }
      });
      return;
    }

    // Table output
    const table = new Table({
      head: [
        chalk.blue("ID"),
        chalk.green("Title"),
        chalk.yellow("Created By"),
        chalk.magenta("Branches"),
        chalk.cyan("URL"),
      ],
      wordWrap: true,
    });

    prs.forEach((pr) => {
      const source = pr.sourceRefName?.replace("refs/heads/", "");
      const target = pr.targetRefName?.replace("refs/heads/", "");
      const url = constructPrUrl(pr);

      table.push([
        chalk.bold(pr.pullRequestId),
        pr.title,
        pr.createdBy?.displayName ?? "-",
        `${source} → ${target}`,
        chalk.underline(url),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    console.error(chalk.red("Error fetching PRs:"), err.message);
  }
})();
