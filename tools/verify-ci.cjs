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
  // A CI run can be re-run at any time, including long after main moved on, and
  // it succeeds again because it succeeded before. Deploying what it points at
  // would put an older backend behind clients already running against a newer
  // one, which is the one ordering apps/native/convex must never see. So the
  // tip of main deploys, from its own run, and nothing else does.
  const tip = await mainTip({ github, context });
  if (tip !== sha) {
    // Superseded, not broken. The tip deploys from its own run, so there is
    // nothing here to fix and nothing to approve.
    core.notice(
      `Skipping: ${sha} is behind the tip of main (${tip}), which deploys from its own run.`,
    );
    core.setOutput("deployable", "false");
    return;
  }
  core.setOutput("deployable", "true");
};

// The verdict above is reached before the production environment asks a human
// to approve, and that ask has no time limit, so main can advance while it
// waits. Run this after the gate, where a stale commit is worth failing for:
// someone is already looking, and they just approved something that moved.
module.exports.requireTip = async ({ github, context, core }) => {
  const sha = selectedSha(context);
  const tip = await mainTip({ github, context });
  if (tip !== sha) {
    core.setFailed(
      `main advanced to ${tip} while this deploy waited for approval, so deploying ${sha} would move the backend backwards. Approve the run for the new tip instead.`,
    );
  }
};
