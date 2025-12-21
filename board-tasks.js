#!/usr/bin/env node

import { readFile } from "fs/promises";
import { spawn } from "child_process";
import { Command } from "commander";
import Table from "cli-table3";
import chalk from "chalk";
import inquirer from "inquirer";

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
      resolve({ stdout, stderr });
    });
  });
}

function parseJsonOrThrow(label, text, stderr = "") {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    throw new Error(
      `${label} returned no JSON. Is Azure DevOps CLI authenticated and defaults set? ` +
        `Try passing --org/--project flags, setting AZURE_DEVOPS_ORG/AZURE_DEVOPS_PROJECT env vars, ` +
        `or run "az devops configure --list".`,
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const preview = trimmed.slice(0, 200);
    throw new Error(`${label} JSON parse failed: ${err.message}. Output preview: ${preview}`);
  }
}

const DEFAULT_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.AssignedTo",
  "System.IterationPath",
  "System.WorkItemType",
  "System.Tags",
];

const program = new Command();
program
  .option("-n, --name <regex>", "Filter tasks by title (regex, case-insensitive)")
  .option("-s, --state <regex>", "Filter tasks by state (regex, case-insensitive)")
  .option("-o, --org <url>", "Azure DevOps organization URL (overrides CLI default)")
  .option("-p, --project <name>", "Azure DevOps project name (overrides CLI default)")
  .option(
    "-c, --changed-since <days>",
    "Only include tasks changed within the last N days (reduces large queries)",
    "180",
  )
  .option("--wiql <query>", "Override the default query with a custom WIQL string")
  .option("--wiql-file <path>", "Read a WIQL query from a file (overrides --wiql)")
  .option(
    "--fields <list>",
    `Comma-separated fields to fetch/display`,
    DEFAULT_FIELDS.join(","),
  )
  .option("--filter-field <field>", "Field to filter by (e.g. System.AssignedTo)")
  .option("--filter-value <regex>", "Regex (case-insensitive) to match against the filter field")
  .option("--interactive", "Enable interactive filtering after initial display", true)
  .option("--no-interactive", "Disable interactive filtering after initial display")
  .option("-d, --debug", "Print Azure CLI stdout/stderr for troubleshooting", false)
  .parse(process.argv);

const options = program.opts();

async function getAzDevOpsDefaults() {
  const { stdout } = await execSpawnAsync("az", ["devops", "configure", "--list"]);
  const lines = stdout.split("\n");
  const orgLine = lines.find((l) => l.trim().startsWith("organization"));
  const projectLine = lines.find((l) => l.trim().startsWith("project"));

  const organization = orgLine?.split("=")[1]?.trim();
  const project = projectLine?.split("=")[1]?.trim();
  return { organization, project };
}

function normalizeOrgProject(org, project) {
  const looksLikeUrl = (val) => typeof val === "string" && /https?:\/\//i.test(val);
  if (looksLikeUrl(project) && !looksLikeUrl(org)) {
    return { org: project, project: org };
  }
  return { org, project };
}

function parseFields() {
  const raw = options.fields || DEFAULT_FIELDS.join(",");
  const list = raw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const unique = [];
  list.forEach((f) => {
    if (!unique.includes(f)) unique.push(f);
  });

  if (!unique.includes("System.Id")) unique.unshift("System.Id");
  return unique;
}

async function getOrgProject() {
  const orgEnv = options.org || process.env.AZURE_DEVOPS_ORG;
  const projectEnv = options.project || process.env.AZURE_DEVOPS_PROJECT;

  let { org, project } = normalizeOrgProject(orgEnv, projectEnv);

  if (org && project) return { org, project };

  const defaults = await getAzDevOpsDefaults();
  ({ org, project } = normalizeOrgProject(org || defaults.organization, project || defaults.project));

  if (!org || !project) {
    throw new Error(
      "Azure DevOps organization/project not set. Pass --org/--project, set AZURE_DEVOPS_ORG/AZURE_DEVOPS_PROJECT, or configure defaults via `az devops configure --defaults organization=... project=...`.",
    );
  }

  return { org, project };
}

async function withOrgProjectArgs(baseArgs = [], orgProject) {
  const { org, project } = orgProject || (await getOrgProject());
  const extra = [...baseArgs];
  if (org) extra.push("--organization", org);
  if (project) extra.push("--project", project);
  return extra;
}

async function withOrgArgs(baseArgs = [], orgProject) {
  const { org } = orgProject || (await getOrgProject());
  const extra = [...baseArgs];
  if (org) extra.push("--organization", org);
  return extra;
}

function formatDefaultWiql() {
  const days = Math.max(1, parseInt(options.changedSince || "180", 10) || 180);
  return [
    "Select [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.IterationPath], [System.WorkItemType], [System.Tags]",
    "From WorkItems",
    "Where [System.TeamProject] = @project",
    "And [System.State] IN ('Backlog', 'Prioritised', 'In progress', 'Done', 'Closed')",
    `And [System.ChangedDate] >= @Today-${days}`,
    "Order By [System.ChangedDate] DESC",
  ].join(" ");
}

async function resolveWiql() {
  if (options.wiql && options.wiqlFile) {
    throw new Error("Specify only one of --wiql or --wiql-file.");
  }

  if (options.wiqlFile) {
    const content = (await readFile(options.wiqlFile, "utf8")).trim();
    if (!content) throw new Error(`WIQL file "${options.wiqlFile}" is empty.`);
    return content;
  }

  if (options.wiql) {
    const content = options.wiql.trim();
    if (!content) throw new Error("Custom WIQL query is empty.");
    return content;
  }

  return formatDefaultWiql();
}

async function fetchTaskIds(wiql) {
  const orgProject = await getOrgProject();
  const args = await withOrgProjectArgs(
    ["boards", "query", "--wiql", wiql, "--output", "json"],
    orgProject,
  );
  if (options.debug) {
    console.error(chalk.gray("Using WIQL:"), wiql);
    console.error(chalk.gray("Resolved org/project:"), orgProject);
    console.error(chalk.gray("boards query args:"), args.join(" "));
  }
  const { stdout, stderr } = await execSpawnAsync("az", args);
  if (options.debug) {
    console.error(chalk.gray("boards query stdout:"), stdout.trim());
    if (stderr.trim()) console.error(chalk.gray("boards query stderr:"), stderr.trim());
  }
  if (!stdout.trim()) {
    if (options.debug) {
      console.error(chalk.gray("boards query returned empty output."));
    }
    return [];
  }
  const data = parseJsonOrThrow("boards query", stdout, stderr);
  if (Array.isArray(data)) {
    return data.map((w) => w.id || w.fields?.["System.Id"]).filter(Boolean);
  }
  return data.workItems?.map((w) => w.id) || [];
}

function normalizeFieldValue(field, value) {
  if (value === null || value === undefined) return "-";
  if (field === "System.AssignedTo") {
    if (typeof value === "string") return value;
    return value.displayName || value.uniqueName || value.mailAddress || "-";
  }
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

async function fetchTaskDetails(ids, fieldsToFetch) {
  const orgProject = await getOrgProject();
  const fetchFields = Array.from(new Set(["System.Id", ...fieldsToFetch]));
  return Promise.all(
    ids.map(async (id) => {
      const args = await withOrgArgs(
        [
          "boards",
          "work-item",
          "show",
          "--id",
          String(id),
          "--fields",
          fetchFields.join(","),
          "--expand",
          "none",
          "--output",
          "json",
        ],
        orgProject,
      );
      const { stdout, stderr } = await execSpawnAsync(
        "az",
        args,
      );
      if (options.debug) {
        console.error(chalk.gray(`work-item ${id} stdout:`), stdout.trim());
        if (stderr.trim()) console.error(chalk.gray(`work-item ${id} stderr:`), stderr.trim());
      }
      const item = parseJsonOrThrow(`work-item ${id}`, stdout, stderr);
      const itemFields = item.fields || {};
      const normalized = {};
      Object.entries(itemFields).forEach(([key, val]) => {
        normalized[key] = normalizeFieldValue(key, val);
      });
      if (!normalized["System.Id"]) normalized["System.Id"] = item.id;
      return { id: item.id, fields: normalized };
    }),
  );
}

function getField(task, name) {
  return task.fields?.[name];
}

function filterTasks(tasks) {
  let filtered = tasks;

  if (options.filterField && options.filterValue) {
    const field = options.filterField.trim();
    const re = new RegExp(options.filterValue, "i");
    filtered = filtered.filter((t) => re.test(String(getField(t, field) || "")));
  }

  if (options.name) {
    const re = new RegExp(options.name, "i");
    filtered = filtered.filter((t) => re.test(String(getField(t, "System.Title") || "")));
  }

  if (options.state) {
    const re = new RegExp(options.state, "i");
    filtered = filtered.filter((t) => re.test(String(getField(t, "System.State") || "")));
  }

  return filtered;
}

function formatHeader(field) {
  const label = fieldLabel(field);

  const color =
    {
      "System.Id": chalk.blue,
      "System.Title": chalk.green,
      "System.State": chalk.yellow,
      "System.AssignedTo": chalk.cyan,
      "System.IterationPath": chalk.magenta,
      "System.WorkItemType": chalk.white,
      "System.Tags": chalk.gray,
    }[field] || chalk.white;

  return color(label);
}

function formatField(field, value) {
  if (value === null || value === undefined || value === "-") return "-";
  if (field === "System.IterationPath") {
    const parts = String(value)
      .split("\\")
      .map((p) => p.trim())
      .filter(Boolean);
    return parts[parts.length - 1] || String(value);
  }
  if (field === "System.Tags" && typeof value === "string") return value.split(";").join(", ").trim();
  return String(value);
}

function fieldLabel(field) {
  return (
    {
      "System.Id": "ID",
      "System.Title": "Title",
      "System.State": "State",
      "System.AssignedTo": "Assigned To",
      "System.IterationPath": "Iteration",
      "System.WorkItemType": "Type",
      "System.Tags": "Tags",
    }[field] || field
  );
}

function filterByField(tasks, field, regex) {
  if (!field || !regex) return tasks;
  return tasks.filter((t) => regex.test(String(getField(t, field) || "")));
}

function resolveFieldChoice(choice, fieldsToDisplay) {
  if (typeof choice === "number") {
    const idx = choice - 1;
    return fieldsToDisplay[idx];
  }
  const asNum = Number(choice);
  if (!Number.isNaN(asNum) && String(asNum) === String(choice)) {
    const idx = asNum - 1;
    return fieldsToDisplay[idx];
  }
  return choice;
}

async function runInteractiveFilter(tasks, fieldsToDisplay) {
  let activeField = null;
  let activeRegex = null;
  let filtered = tasks;

  while (true) {
    const filterLabel = activeField
      ? `${fieldLabel(activeField)} =~ /${activeRegex.source}/i`
      : "none";
    console.log(chalk.gray(`\nCurrent filter: ${filterLabel}`));
    printTasks(filtered, fieldsToDisplay);

    const { fieldChoice } = await inquirer.prompt([
      {
        type: "list",
        name: "fieldChoice",
        message: "Filter by column (or exit):",
        choices: [
          { name: "Exit", value: "__exit" },
          { name: "Show all (no filter)", value: "__none" },
          ...fieldsToDisplay.map((f, idx) => ({
            name: `${idx + 1}. ${fieldLabel(f)}`,
            value: f,
          })),
        ],
      },
    ]);

    if (fieldChoice === "__exit") break;
    if (fieldChoice === "__none") {
      activeField = null;
      activeRegex = null;
      filtered = tasks;
      continue;
    }

    const resolvedField = resolveFieldChoice(fieldChoice, fieldsToDisplay);
    if (!resolvedField) {
      console.log(chalk.yellow("Invalid column selection. Showing all results."));
      activeField = null;
      activeRegex = null;
      filtered = tasks;
      continue;
    }

    const { regexText } = await inquirer.prompt([
      {
        type: "input",
        name: "regexText",
        message: `Regex to match ${fieldLabel(resolvedField)} (case-insensitive):`,
        validate: (input) => {
          try {
            // eslint-disable-next-line no-new
            new RegExp(input, "i");
            return true;
          } catch (err) {
            return `Invalid regex: ${err.message}`;
          }
        },
      },
    ]);

    activeField = resolvedField;
    activeRegex = new RegExp(regexText, "i");
    filtered = filterByField(tasks, activeField, activeRegex);
  }
}

function printTasks(tasks, fieldsToDisplay) {
  if (!tasks.length) {
    console.log(chalk.yellow("No tasks found with the given filters."));
    return;
  }

  const colWidths = computeColWidths(fieldsToDisplay);
  const table = new Table({
    head: fieldsToDisplay.map((f) => formatHeader(f)),
    colWidths,
    wordWrap: true,
  });

  tasks.forEach((t) => {
    table.push(
      fieldsToDisplay.map((field) => {
        const value = getField(t, field);
        return field === "System.Id" ? chalk.bold(value) : formatField(field, value);
      }),
    );
  });

  console.log(table.toString());
}

function computeColWidths(fields) {
  const totalWidth = Math.max(process.stdout.columns || 120, 80);
  const weights = {
    "System.Id": 0.08,
    "System.Title": 0.3,
    "System.State": 0.1,
    "System.AssignedTo": 0.2,
    "System.IterationPath": 0.12,
    "System.WorkItemType": 0.1,
    "System.Tags": 0.1,
  };
  const defaultWeight = 0.14;
  const padding = fields.length * 3 + 1; // borders/padding heuristic
  const usable = Math.max(totalWidth - padding, 40);
  const weightSum = fields.reduce((sum, f) => sum + (weights[f] || defaultWeight), 0);
  const cols = fields.map((f) => Math.max(6, Math.floor((weights[f] || defaultWeight) / weightSum * usable)));

  // Distribute any leftover width to widest columns first.
  let allocated = cols.reduce((a, b) => a + b, 0);
  let leftover = usable - allocated;
  while (leftover > 0) {
    const idx = cols.indexOf(Math.max(...cols));
    cols[idx] += 1;
    leftover -= 1;
  }

  return cols;
}

(async () => {
  try {
    const wiql = await resolveWiql();
    const fieldsToDisplay = parseFields();
    const fetchFields = [...fieldsToDisplay];
    if (options.filterField && !fetchFields.includes(options.filterField.trim())) {
      fetchFields.push(options.filterField.trim());
    }
    const ids = await fetchTaskIds(wiql);
    if (!ids.length) {
      console.log(chalk.yellow("No open tasks found on the board."));
      return;
    }
    const tasks = await fetchTaskDetails(ids, fetchFields);
    const filtered = filterTasks(tasks);
    printTasks(filtered, fieldsToDisplay);
    if (options.interactive) {
      await runInteractiveFilter(filtered, fieldsToDisplay);
    }
  } catch (err) {
    console.error(chalk.red("Error fetching tasks:"), err.message);
  }
})();
