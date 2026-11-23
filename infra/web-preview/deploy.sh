#!/usr/bin/env bash
set -euo pipefail

cluster=eventflow-staging
api_service=eventflow-preview-api
web_service=eventflow-web-preview
account=$(aws sts get-caller-identity --query Account --output text)
registry="$account.dkr.ecr.$AWS_REGION.amazonaws.com"
service_arn="arn:aws:ecs:$AWS_REGION:$account:service/$cluster/$web_service"
release=${GITHUB_SHA:?Missing release commit}

export DOCKER_AUTH_CONFIG
DOCKER_AUTH_CONFIG=$(aws ecr get-authorization-token --query 'authorizationData[0].authorizationToken' --output json |
  jq -ce --arg host "$registry" '{auths:{($host):{auth:.}}}')

publish() {
  local repository=$1 context=$2 digest
  shift 2
  if ! digest=$(aws ecr describe-images --repository-name "$repository" --image-ids "imageTag=$release" --query 'imageDetails[0].imageDigest' --output text 2>&1); then
    [[ $digest == *ImageNotFoundException* ]] || { echo "$digest" >&2; return 1; }
    docker build --platform linux/amd64 --provenance=false --tag "$registry/$repository:$release" "$@" "$context" >&2 || return
    docker push "$registry/$repository:$release" >&2 || return
    digest=$(aws ecr describe-images --repository-name "$repository" --image-ids "imageTag=$release" --query 'imageDetails[0].imageDigest' --output text) || return
  fi
  [[ $digest =~ ^sha256:[a-f0-9]{64}$ ]] || return 1
  printf '%s/%s@%s\n' "$registry" "$repository" "$digest"
}

register_api_revision() {
  local role=$1 image=$2 task
  task=$(aws ecs describe-task-definition --task-definition "eventflow-preview-$role" --query taskDefinition --output json |
    jq -ce --arg role "$role" --arg image "$image" '
      del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy,.deregisteredAt,.deleteRequestedAt)
      | .containerDefinitions |= (if any(.[]; .name == $role) then map(if .name == $role then .image = $image else . end) else error("Missing application container") end)') || return
  aws ecs register-task-definition --cli-input-json "$task" --query taskDefinition.taskDefinitionArn --output text
}

api_image=$(publish eventflow-api backend)
web_image=$(publish eventflow-web frontend --build-arg NEXT_PUBLIC_API_URL=/api)
unset DOCKER_AUTH_CONFIG

network=$(aws ecs describe-services --cluster "$cluster" --services "$api_service" --query 'services[0].networkConfiguration' --output json)
migration_revision=$(register_api_revision migrate "$api_image")
launch=$(aws ecs run-task --cluster "$cluster" --task-definition "$migration_revision" --launch-type FARGATE --network-configuration "$network")
migration_task=$(jq -er 'if .failures == [] then .tasks[0].taskArn else error(.failures|tostring) end' <<<"$launch")
echo "Migration task: $migration_task"
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$migration_task"
completed=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$migration_task")
if ! jq -e 'any(.tasks[0].containers[]; .name == "migrate" and .exitCode == 0)' <<<"$completed" >/dev/null; then
  jq '.tasks[0]|{stoppedReason,containers:[.containers[]|{name,exitCode,reason}]}' <<<"$completed" >&2
  exit 1
fi

api_revision=$(register_api_revision api "$api_image")
aws ecs update-service --cluster "$cluster" --service "$api_service" --task-definition "$api_revision" --desired-count 1 >/dev/null
aws ecs wait services-stable --cluster "$cluster" --services "$api_service"
active_revision=$(aws ecs describe-services --cluster "$cluster" --services "$api_service" --query 'services[0].taskDefinition' --output text)
[[ $active_revision == "$api_revision" ]]

web_rollout=$(aws ecs update-express-gateway-service --service-arn "$service_arn" --primary-container "image=$web_image,containerPort=3000" --query 'service.currentDeployment' --output text)
[[ $web_rollout == arn:aws:ecs:*:service-deployment/* ]]
web_status=''
for _ in {1..80}; do
  web_status=$(aws ecs describe-service-deployments --service-deployment-arns "$web_rollout" --query 'serviceDeployments[0].status' --output text)
  case "$web_status" in
    SUCCESSFUL) break ;;
    STOPPED|STOP_REQUESTED|ROLLBACK_*) echo "Web deployment: $web_status" >&2; exit 1 ;;
  esac
  sleep 10
done
[[ $web_status == SUCCESSFUL ]]

curl_args=(--silent --show-error --retry 5 --retry-all-errors --max-time 15)
curl "${curl_args[@]}" --fail "$PREVIEW_URL/api/health" | jq -e '.status == "ok" and .db == "up"'
curl "${curl_args[@]}" --fail "$PREVIEW_URL/api/events" | jq -e '.data | type == "array"'
curl "${curl_args[@]}" --fail "$PREVIEW_URL/" >/dev/null
[[ $(curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}' "$PREVIEW_URL/api/internal") == 403 ]]
printf 'Release `%s` is available at %s\n\nMigration task `%s` exited with code 0.\n' "$release" "$PREVIEW_URL" "$migration_task" >> "$GITHUB_STEP_SUMMARY"
