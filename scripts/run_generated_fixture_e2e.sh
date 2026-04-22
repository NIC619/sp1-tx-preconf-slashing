#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROOF_SYSTEM="${1:-groth16}"
if [[ $# -gt 0 ]]; then
  shift
fi
FIXTURE_PATH="${TX_INCLUSION_E2E_FIXTURE_PATH:-$(mktemp "${ROOT_DIR}/contracts/src/fixtures/${PROOF_SYSTEM}-e2e-XXXXXX.json")}"
SP1_PROVER_MODE="${SP1_PROVER:-cpu}"

load_dotenv() {
  local dotenv_path="${ROOT_DIR}/.env"
  if [[ -f "${dotenv_path}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${dotenv_path}"
    set +a
    SP1_PROVER_MODE="${SP1_PROVER:-${SP1_PROVER_MODE}}"
  fi
}

print_local_groth16_help() {
  cat <<'EOF'
Local Groth16 proving uses SP1's Docker/gnark flow.

If you are on Apple Silicon and see an image manifest error for `linux/arm64`, try one of:
  1. Recommended: use the prover network
     SP1_PROVER=network ./scripts/run_generated_fixture_e2e.sh groth16

  2. Local workaround: force amd64 emulation
     DOCKER_DEFAULT_PLATFORM=linux/amd64 ./scripts/run_generated_fixture_e2e.sh groth16

If Docker/OrbStack is not running, start it first and confirm with:
  docker info
EOF
}

preflight_checks() {
  if [[ "${SP1_PROVER_MODE}" == "network" ]]; then
    if [[ -z "${NETWORK_PRIVATE_KEY:-}" ]]; then
      echo "Error: SP1_PROVER=network requires NETWORK_PRIVATE_KEY in the environment." >&2
      exit 1
    fi
    return
  fi

  if [[ "${PROOF_SYSTEM}" != "groth16" ]]; then
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: local Groth16 proving requires Docker, but \`docker\` was not found." >&2
    echo >&2
    print_local_groth16_help >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Error: local Groth16 proving requires Docker to be running." >&2
    echo >&2
    print_local_groth16_help >&2
    exit 1
  fi

  cat >&2 <<'EOF'
Local Groth16 proving can be resource intensive.
Plan for at least 16 GB of Docker memory, and potentially more depending on the host machine and workload.

If OrbStack or Docker prompts you to increase memory, do that before retrying.
EOF

  if [[ "$(uname -m)" == "arm64" && -z "${DOCKER_DEFAULT_PLATFORM:-}" ]]; then
    cat >&2 <<'EOF'
Note: you are on Apple Silicon and SP1's `ghcr.io/succinctlabs/sp1-gnark:v6.1.0` tag may not provide
an arm64 manifest for local Groth16 proving.

If this run fails with a Docker manifest error, retry with one of:
  SP1_PROVER=network ./scripts/run_generated_fixture_e2e.sh groth16
  DOCKER_DEFAULT_PLATFORM=linux/amd64 ./scripts/run_generated_fixture_e2e.sh groth16

Continuing with the current configuration...
EOF
  fi
}

cleanup() {
  if [[ -z "${TX_INCLUSION_E2E_FIXTURE_PATH:-}" && -f "${FIXTURE_PATH}" ]]; then
    rm -f "${FIXTURE_PATH}"
  fi
}
trap cleanup EXIT

load_dotenv
preflight_checks

pushd "${ROOT_DIR}" >/dev/null

echo "Generating ${PROOF_SYSTEM} fixture at ${FIXTURE_PATH}"

cargo run --release --bin evm -- --system "${PROOF_SYSTEM}" --output-path "${FIXTURE_PATH}" "$@"

echo "Running Foundry verification against generated fixture"

pushd "${ROOT_DIR}/contracts" >/dev/null
TX_INCLUSION_E2E_FIXTURE_PATH="${FIXTURE_PATH}" \
FOUNDRY_OFFLINE=true \
~/.foundry/bin/forge test --match-path test/GeneratedFixtureE2E.t.sol
popd >/dev/null

popd >/dev/null
