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

seed_launch=$(aws ecs run-task --cluster "$cluster" --task-definition "$migration_revision" --launch-type FARGATE --network-configuration "$network" --overrides '{"containerOverrides":[{"name":"migrate","command":["pnpm","run","prisma:seed"]}]}')
seed_task=$(jq -er 'if .failures == [] then .tasks[0].taskArn else error(.failures|tostring) end' <<<"$seed_launch")
echo "Seed task: $seed_task"
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$seed_task"
seed_completed=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$seed_task")
if ! jq -e 'any(.tasks[0].containers[]; .name == "migrate" and .exitCode == 0)' <<<"$seed_completed" >/dev/null; then
  jq '.tasks[0]|{stoppedReason,containers:[.containers[]|{name,exitCode,reason}]}' <<<"$seed_completed" >&2
  exit 1
fi

api_revision=$(register_api_revision api "$api_image")
aws ecs update-service --cluster "$cluster" --service "$api_service" --task-definition "$api_revision" --desired-count 1 >/dev/null
aws ecs wait services-stable --cluster "$cluster" --services "$api_service"
active_revision=$(aws ecs describe-services --cluster "$cluster" --services "$api_service" --query 'services[0].taskDefinition' --output text)
[[ $active_revision == "$api_revision" ]]

latest_web_rollout() {
  aws ecs list-service-deployments --cluster "$cluster" --service "$web_service" \
    --query 'sort_by(serviceDeployments, &createdAt)[-1].serviceDeploymentArn' --output text
}

wait_for_web_rollout() {
  local deployment=$1 status=''
  for _ in {1..80}; do
    status=$(aws ecs describe-service-deployments --service-deployment-arns "$deployment" --query 'serviceDeployments[0].status' --output text)
    case "$status" in
      SUCCESSFUL) return 0 ;;
      STOPPED|STOP_REQUESTED|ROLLBACK_*) break ;;
    esac
    sleep 10
  done
  echo "Web deployment $deployment ended in $status." >&2
  return 1
}

previous_web_rollout=$(latest_web_rollout)
if [[ $previous_web_rollout == arn:aws:ecs:*:service-deployment/* ]]; then
  previous_status=$(aws ecs describe-service-deployments --service-deployment-arns "$previous_web_rollout" --query 'serviceDeployments[0].status' --output text)
  if [[ $previous_status == IN_PROGRESS || $previous_status == PENDING ]]; then
    wait_for_web_rollout "$previous_web_rollout"
  fi
fi
running_web_image=$(aws ecs describe-express-gateway-service --service-arn "$service_arn" --query 'service.activeConfigurations[0].primaryContainer.image' --output text)
if [[ $running_web_image != "$web_image" ]]; then
  aws ecs update-express-gateway-service --service-arn "$service_arn" --primary-container "image=$web_image,containerPort=3000" >/dev/null
  web_rollout=''
  for _ in {1..12}; do
    web_rollout=$(latest_web_rollout)
    if [[ $web_rollout == arn:aws:ecs:*:service-deployment/* && $web_rollout != "$previous_web_rollout" ]]; then break; fi
    sleep 5
  done
  if [[ $web_rollout != arn:aws:ecs:*:service-deployment/* || $web_rollout == "$previous_web_rollout" ]]; then
    echo 'Could not identify the new web deployment.' >&2
    exit 1
  fi
  echo "Web deployment: $web_rollout"
  wait_for_web_rollout "$web_rollout"
fi

curl_args=(--silent --show-error --retry 5 --retry-all-errors --max-time 15)
curl "${curl_args[@]}" --fail "$PREVIEW_URL/api/health" | jq -e '.status == "ok" and .db == "up"'
curl "${curl_args[@]}" --fail "$PREVIEW_URL/api/events" | jq -e '.data | type == "array"'
curl "${curl_args[@]}" --fail "$PREVIEW_URL/" >/dev/null
[[ $(curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}' "$PREVIEW_URL/api/internal") == 403 ]]
printf 'Release `%s` is available at %s\n\nMigration task `%s` exited with code 0.\n' "$release" "$PREVIEW_URL" "$migration_task" >> "$GITHUB_STEP_SUMMARY"
