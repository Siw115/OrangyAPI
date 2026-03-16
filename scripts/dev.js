const { spawn } = require("child_process");

const children = [];
let nonZeroExitSeen = false;

function start(name, command) {
  const child = spawn(command, {
    stdio: "inherit",
    shell: true
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      nonZeroExitSeen = true;
      console.error(`${name} exited with code ${code}`);
    } else {
      console.log(`${name} exited`);
    }

    const stillRunning = children.some((proc) => !proc.killed && proc.exitCode === null);
    if (!stillRunning) {
      process.exit(nonZeroExitSeen ? 1 : 0);
    }
  });

  child.on("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
    nonZeroExitSeen = true;
  });

  children.push(child);
}

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  setTimeout(() => process.exit(exitCode), 150);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("backend", "npm --prefix orangutan-api run start");
start("frontend", "npm --prefix frontend run dev");
