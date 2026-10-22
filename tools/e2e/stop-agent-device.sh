#!/usr/bin/env bash
# Stops the agent-device daemon. `daemon stop` refuses a daemon whose info
# file has no start time (run 39049617284), so it is then stopped by the pid
# it recorded.
set -u
agent_device="$GITHUB_WORKSPACE/node_modules/agent-device/bin/agent-device.mjs"
node "$agent_device" daemon stop && exit 0
echo "::warning::agent-device would not stop its daemon; stopping it by pid"
for info in $(find "$HOME/.agent-device" -name daemon.json 2>/dev/null); do
  pid=$(node -p "require('$info').pid") || continue
  # Signal it only if that pid is still an agent-device process.
  if ps -p "$pid" -o command= 2>/dev/null | grep -q agent-device; then
    kill "$pid" 2>/dev/null || true
    # Wait for it to exit, so the runner cache saved next does not catch its
    # state files mid-shutdown.
    for _ in $(seq 30); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  # The runner cache saves all of ~/.agent-device; keep the stopped daemon's
  # state files out of it.
  rm -f "$info" "$(dirname "$info")/daemon.lock"
done
