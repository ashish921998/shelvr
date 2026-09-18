module.exports = async ({ github, context, core }) => {
  const sha = context.payload.workflow_run?.head_sha ?? context.sha;
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...context.repo,
    workflow_id: "ci.yml",
    head_sha: sha,
    branch: "main",
    event: "push",
    per_page: 100,
  });
  const latest = runs
    .filter(
      (run) =>
        run.head_sha === sha &&
        run.head_repository?.full_name ===
          `${context.repo.owner}/${context.repo.repo}`,
    )
    .sort((left, right) => right.run_number - left.run_number)[0];
  if (latest?.status !== "completed" || latest.conclusion !== "success") {
    core.setFailed(
      "The selected commit must have a successful main push CI run before deployment.",
    );
    core.setOutput("deployable", "false");
    return;
  }
  // A CI run can be re-run at any time, including long after main moved on, and
  // it succeeds again because it succeeded before. Deploying what it points at
  // would put an older backend behind clients already running against a newer
  // one, which is the one ordering apps/native/convex must never see. So the
  // tip of main deploys, from its own run, and nothing else does.
  const { data: branch } = await github.rest.repos.getBranch({
    ...context.repo,
    branch: "main",
  });
  if (branch.commit.sha !== sha) {
    // Superseded, not broken. The tip deploys from its own run, so there is
    // nothing here to fix and nothing to approve.
    core.notice(
      `Skipping: ${sha} is behind the tip of main (${branch.commit.sha}), which deploys from its own run.`,
    );
    core.setOutput("deployable", "false");
    return;
  }
  core.setOutput("deployable", "true");
};
