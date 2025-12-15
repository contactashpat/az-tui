#!/usr/bin/env node

import { spawn } from "child_process";
import { Command } from "commander";
import Table from "cli-table3";
import chalk from "chalk";

// Run a command without a shell and return stdout as a string.
function execSpawnAsync(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `Command "${command} ${args.join(" ")}" exited with code ${code}: ${stderr.trim()}`,
          ),
        );
      }
      resolve(stdout);
    });
  });
}

const program = new Command();
program
  .option("-n, --name <regex>", "Filter tasks by title (regex, case-insensitive)")
  .option("-s, --state <regex>", "Filter tasks by state (regex, case-insensitive)")
  .parse(process.argv);

const options = program.opts();

const WIQL = `
Select [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.IterationPath]
From WorkItems
Where [System.TeamProject] = @project
  And [System.WorkItemType] = 'Task'
  And [System.State] NOT IN ('Closed', 'Done', 'Removed', 'Resolved', 'Completed')
Order By [System.ChangedDate] DESC
`;

async function fetchTaskIds() {
  const stdout = await execSpawnAsync("az", ["boards", "query", "--wiql", WIQL, "--output", "json"]);
  const data = JSON.parse(stdout);
  return data.workItems?.map((w) => w.id) || [];
}

async function fetchTaskDetails(ids) {
  return Promise.all(
    ids.map(async (id) => {
      const stdout = await execSpawnAsync("az", [
        "boards",
        "work-item",
        "show",
        "--id",
        String(id),
        "--fields",
        "System.Id,System.Title,System.State,System.AssignedTo,System.IterationPath",
        "--output",
        "json",
      ]);
      const item = JSON.parse(stdout);
      const fields = item.fields || {};
      return {
        id: item.id,
        title: fields["System.Title"] || "-",
        state: fields["System.State"] || "-",
        assignedTo: fields["System.AssignedTo"]?.displayName || "-",
        iteration: fields["System.IterationPath"] || "-",
      };
    }),
  );
}

function filterTasks(tasks) {
  let filtered = tasks;

  if (options.name) {
    const re = new RegExp(options.name, "i");
    filtered = filtered.filter((t) => re.test(t.title));
  }

  if (options.state) {
    const re = new RegExp(options.state, "i");
    filtered = filtered.filter((t) => re.test(t.state));
  }

  return filtered;
}

function printTasks(tasks) {
  if (!tasks.length) {
    console.log(chalk.yellow("No tasks found with the given filters."));
    return;
  }

  const table = new Table({
    head: [
      chalk.blue("ID"),
      chalk.green("Title"),
      chalk.yellow("State"),
      chalk.cyan("Assigned To"),
      chalk.magenta("Iteration"),
    ],
    wordWrap: true,
  });

  tasks.forEach((t) => {
    table.push([
      chalk.bold(t.id),
      t.title,
      t.state,
      t.assignedTo,
      t.iteration,
    ]);
  });

  console.log(table.toString());
}

(async () => {
  try {
    const ids = await fetchTaskIds();
    if (!ids.length) {
      console.log(chalk.yellow("No open tasks found on the board."));
      return;
    }
    const tasks = await fetchTaskDetails(ids);
    const filtered = filterTasks(tasks);
    printTasks(filtered);
  } catch (err) {
    console.error(chalk.red("Error fetching tasks:"), err.message);
  }
})();
