import { spawn } from "child_process";

// Helper that runs a command with explicit args (no shell) and returns stdout.
async function execSpawnAsync(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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

async function getAzDevOpsDefaults() {
  const stdout = await execSpawnAsync("az", ["devops", "configure", "--list"]);
  const lines = stdout.split("\n");
  const orgLine = lines.find((l) => l.trim().startsWith("organization"));
  const projectLine = lines.find((l) => l.trim().startsWith("project"));

  const organization = orgLine?.split("=")[1]?.trim();
  const project = projectLine?.split("=")[1]?.trim();
  return { organization, project };
}

export async function fetchPRs(status = "active") {
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

export async function constructPrUrl(pr) {
  const { organization: org, project: proj } = await getAzDevOpsDefaults();
  const repo = pr.repository?.name;
  const id = pr.pullRequestId;
  if (org && proj && repo && id) {
    return `${org}/${proj}/_git/${repo}/pullrequest/${id}`;
  }

  return "";
}
