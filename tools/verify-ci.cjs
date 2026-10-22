const selectedSha = (context) =>
  context.payload.workflow_run?.head_sha ?? context.sha;

const mainTip = async ({ github, context }) => {
  const { data } = await github.rest.repos.getBranch({
    ...context.repo,
    branch: "main",
  });
  return data.commit.sha;
};

module.exports = async ({ github, context, core }) => {
  const sha = selectedSha(context);
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
  const tip = await mainTip({ github, context });
  if (tip !== sha) {
    core.notice(
      `Skipping: ${sha} is behind the tip of main (${tip}), which deploys from its own run.`,
    );
    core.setOutput("deployable", "false");
    return;
  }
  core.setOutput("deployable", "true");
};

module.exports.requireTip = async ({ github, context, core }) => {
  const sha = selectedSha(context);
  const tip = await mainTip({ github, context });
  if (tip !== sha) {
    core.setFailed(
      `main advanced to ${tip} while this deploy was queued, so deploying ${sha} would move the backend backwards. Run the deployment for the new tip instead.`,
    );
  }
};
