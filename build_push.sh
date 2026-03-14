#!/usr/bin/env bash

set -euo pipefail

REGISTRY_HOST="${REGISTRY_HOST:-registry.eaglepass.io}"
IMAGE_NAME="${IMAGE_NAME:-strata}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-${REGISTRY_HOST}/${IMAGE_NAME}}"
PUSH_ENABLED="${PUSH_ENABLED:-true}"

default_tag="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --short)" ]]; then
  default_tag="${default_tag}-dirty-$(date +%Y%m%d%H%M%S)"
fi

TAG="${1:-${IMAGE_TAG:-$default_tag}}"

IMAGE_TAGGED_REF="${IMAGE_REPOSITORY}:${TAG}"
IMAGE_LATEST_REF="${IMAGE_REPOSITORY}:latest"

printf 'Building %s and %s\n' "$IMAGE_TAGGED_REF" "$IMAGE_LATEST_REF"
docker build --pull -t "$IMAGE_TAGGED_REF" -t "$IMAGE_LATEST_REF" .

if [[ "$PUSH_ENABLED" == "false" ]]; then
  printf 'Skipping push because PUSH_ENABLED=false\n'
  exit 0
fi

printf 'Pushing %s\n' "$IMAGE_TAGGED_REF"
docker push "$IMAGE_TAGGED_REF"

printf 'Pushing %s\n' "$IMAGE_LATEST_REF"
docker push "$IMAGE_LATEST_REF"

printf 'Done. Image available at %s\n' "$IMAGE_TAGGED_REF"
