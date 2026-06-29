export function installPackageCommandSpecs({ packageSource, toolInstallDir }) {
  return [
    {
      id: "npm-init",
      description: "Create a fresh package project for the installed CodeDecay CLI.",
      cwd: toolInstallDir,
      command: "npm",
      args: ["init", "-y"],
      expectedExitCodes: [0]
    },
    {
      id: "npm-install-codedecay",
      description: "Install the requested published package or tarball.",
      cwd: toolInstallDir,
      command: "npm",
      args: ["install", packageSource.installSpec],
      expectedExitCodes: [0]
    }
  ];
}

export function prepareExampleRepoCommandSpecs({ commitLabel, exampleName, targetDir }) {
  return [
    {
      id: `${exampleName}-materialize-baseline`,
      description: `Materialize the ${commitLabel} baseline files.`,
      cwd: targetDir,
      command: "node",
      args: ["scripts/materialize.mjs", "baseline"],
      expectedExitCodes: [0]
    },
    {
      id: `${exampleName}-git-init`,
      description: `Initialize git for the ${commitLabel}.`,
      cwd: targetDir,
      command: "git",
      args: ["init"],
      expectedExitCodes: [0]
    },
    {
      id: `${exampleName}-git-name`,
      description: "Set local git user.name.",
      cwd: targetDir,
      command: "git",
      args: ["config", "user.name", "CodeDecay Example"],
      expectedExitCodes: [0]
    },
    {
      id: `${exampleName}-git-email`,
      description: "Set local git user.email.",
      cwd: targetDir,
      command: "git",
      args: ["config", "user.email", "codedecay@example.com"],
      expectedExitCodes: [0]
    },
    {
      id: `${exampleName}-git-add`,
      description: "Stage the baseline files.",
      cwd: targetDir,
      command: "git",
      args: ["add", "."],
      expectedExitCodes: [0]
    },
    {
      id: `${exampleName}-git-commit`,
      description: "Commit the baseline files.",
      cwd: targetDir,
      command: "git",
      args: ["commit", "-m", `baseline ${commitLabel}`],
      expectedExitCodes: [0]
    },
    {
      id: `${exampleName}-materialize-risky`,
      description: `Materialize the ${commitLabel} risky PR files.`,
      cwd: targetDir,
      command: "node",
      args: ["scripts/materialize.mjs", "risky"],
      expectedExitCodes: [0]
    }
  ];
}

export function installedCliCommandSpecs({ codedecayBin, toolInstallDir }) {
  return [
    {
      id: "codedecay-version",
      description: "The installed binary prints its package version.",
      cwd: toolInstallDir,
      command: codedecayBin,
      args: ["version"],
      expectedExitCodes: [0]
    },
    {
      id: "codedecay-help",
      description: "The installed binary prints help.",
      cwd: toolInstallDir,
      command: codedecayBin,
      args: ["--help"],
      expectedExitCodes: [0]
    },
    {
      id: "codedecay-update-dry-run",
      description: "The installed binary can render an update dry run.",
      cwd: toolInstallDir,
      command: codedecayBin,
      args: ["update", "--cwd", toolInstallDir],
      expectedExitCodes: [0]
    },
    {
      id: "codedecay-uninstall-dry-run",
      description: "The installed binary can render an uninstall dry run.",
      cwd: toolInstallDir,
      command: codedecayBin,
      args: ["uninstall", "--cwd", toolInstallDir],
      expectedExitCodes: [0]
    }
  ];
}

export function analysisCommandSpecs({ codedecayBin, prefix, repoDir }) {
  return [
    {
      id: `${prefix}-analyze-json`,
      description: `The installed binary writes JSON analysis for ${prefix}.`,
      cwd: repoDir,
      command: codedecayBin,
      args: ["analyze", "--cwd", repoDir, "--format", "json", "--output", "codedecay-output/analyze.json"],
      expectedExitCodes: [0],
      outputFiles: [{ path: "codedecay-output/analyze.json", cwd: repoDir, parseJson: true }]
    },
    {
      id: `${prefix}-analyze-markdown`,
      description: `The installed binary writes Markdown analysis for ${prefix}.`,
      cwd: repoDir,
      command: codedecayBin,
      args: ["analyze", "--cwd", repoDir, "--format", "markdown", "--output", "codedecay-output/analyze.md"],
      expectedExitCodes: [0],
      outputFiles: [{ path: "codedecay-output/analyze.md", cwd: repoDir }]
    },
    {
      id: `${prefix}-analyze-sarif`,
      description: `The installed binary writes SARIF analysis for ${prefix}.`,
      cwd: repoDir,
      command: codedecayBin,
      args: ["analyze", "--cwd", repoDir, "--format", "sarif", "--output", "codedecay-output/analyze.sarif"],
      expectedExitCodes: [0],
      outputFiles: [{ path: "codedecay-output/analyze.sarif", cwd: repoDir, parseJson: true }]
    },
    {
      id: `${prefix}-redteam-json`,
      description: `The installed binary writes JSON redteam output for ${prefix}.`,
      cwd: repoDir,
      command: codedecayBin,
      args: ["redteam", "--cwd", repoDir, "--format", "json", "--output", "codedecay-output/redteam.json"],
      expectedExitCodes: [0],
      outputFiles: [{ path: "codedecay-output/redteam.json", cwd: repoDir, parseJson: true }]
    },
    {
      id: `${prefix}-redteam-markdown`,
      description: `The installed binary writes Markdown redteam output for ${prefix}.`,
      cwd: repoDir,
      command: codedecayBin,
      args: ["redteam", "--cwd", repoDir, "--format", "markdown", "--output", "codedecay-output/redteam.md"],
      expectedExitCodes: [0],
      outputFiles: [{ path: "codedecay-output/redteam.md", cwd: repoDir }]
    }
  ];
}

export function nextExampleCommandSpecs({ codedecayBin, repoDir }) {
  return [
    ...analysisCommandSpecs({ codedecayBin, repoDir, prefix: "nextjs-risk-demo" }),
    {
      id: "nextjs-risk-demo-agent-codex",
      description: "The installed binary writes a Codex handoff bundle for the Next.js demo.",
      cwd: repoDir,
      command: codedecayBin,
      args: ["agent", "--cwd", repoDir, "--profile", "codex", "--format", "markdown", "--output", "codedecay-output/agent-codex.md"],
      expectedExitCodes: [0],
      outputFiles: [{ path: "codedecay-output/agent-codex.md", cwd: repoDir }]
    },
    {
      id: "nextjs-risk-demo-fail-on-high",
      description: "The installed binary fails high-risk Next.js changes when fail-on high is set.",
      cwd: repoDir,
      command: codedecayBin,
      args: ["analyze", "--cwd", repoDir, "--fail-on", "high"],
      expectedExitCodes: [1]
    }
  ];
}

export function nodeApiExampleCommandSpecs({ codedecayBin, repoDir }) {
  return [
    ...analysisCommandSpecs({ codedecayBin, repoDir, prefix: "node-api-risk-demo" }),
    {
      id: "node-api-risk-demo-agent-codex",
      description: "The installed binary writes a Codex handoff bundle for the Node API demo.",
      cwd: repoDir,
      command: codedecayBin,
      args: ["agent", "--cwd", repoDir, "--profile", "codex", "--format", "markdown", "--output", "codedecay-output/agent-codex.md"],
      expectedExitCodes: [0],
      outputFiles: [{ path: "codedecay-output/agent-codex.md", cwd: repoDir }]
    },
    {
      id: "node-api-risk-demo-execute-json",
      description: "The installed binary runs configured Node API checks and reports the expected contract failure.",
      cwd: repoDir,
      command: codedecayBin,
      args: ["execute", "--cwd", repoDir, "--format", "json", "--output", "codedecay-output/execute.json"],
      expectedExitCodes: [1],
      outputFiles: [{ path: "codedecay-output/execute.json", cwd: repoDir, parseJson: true }]
    },
    {
      id: "node-api-risk-demo-execute-markdown",
      description: "The installed binary writes markdown for configured Node API checks.",
      cwd: repoDir,
      command: codedecayBin,
      args: ["execute", "--cwd", repoDir, "--format", "markdown", "--output", "codedecay-output/execute.md"],
      expectedExitCodes: [1],
      outputFiles: [{ path: "codedecay-output/execute.md", cwd: repoDir }]
    },
    {
      id: "node-api-risk-demo-fail-on-high",
      description: "The installed binary fails high-risk Node API changes when fail-on high is set.",
      cwd: repoDir,
      command: codedecayBin,
      args: ["analyze", "--cwd", repoDir, "--fail-on", "high"],
      expectedExitCodes: [1]
    }
  ];
}
