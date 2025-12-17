import chalk from "chalk";

export function getApprovalStatus(pr) {
  const votes =
    pr.reviewers?.map((r) => r.vote).filter((v) => typeof v === "number") || [];
  if (votes.some((v) => v < 0)) return chalk.red("Rejected");
  if (votes.some((v) => v >= 5)) return chalk.green("Approved");
  return chalk.yellow("Pending");
}

// Wraps text to a fixed width so long titles render neatly in the table.
export function wrapText(text = "", width = 30) {
  if (!text) return "-";
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const needsSpace = current.length > 0 ? 1 : 0;
    if (current.length + needsSpace + word.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

// Breaks long branch names onto multiple lines for readability.
export function formatBranch(name = "", width = 20) {
  const branch = (name || "").replace("refs/heads/", "");
  if (!branch) return "-";

  const parts = [];
  for (let i = 0; i < branch.length; i += width) {
    parts.push(branch.slice(i, i + width));
  }
  return parts.join("\n");
}
