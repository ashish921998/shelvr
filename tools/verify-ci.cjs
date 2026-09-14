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
  }
};
