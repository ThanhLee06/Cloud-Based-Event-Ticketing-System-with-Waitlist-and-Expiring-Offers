# EventFlow operations and private exports

## Deploy / wire the shared AWS resources

Coordinate with **Anhkiet10 (ST-036)** before applying this stack. Do not create long-lived AWS keys. This stack creates a dedicated `${name_prefix}-api-task` role for application code and grants it only the attendee export S3 prefix. Set `log_delivery_role_name` to the API's existing ECS task execution role; in the current `eventflow-preview-api:3` definition, that is `eventflow-preview-api-execution`. After apply, set the task definition's **Task role** to the `api_task_role_name` output and keep **Task execution role** as `eventflow-preview-api-execution`. Set the API environment to `AWS_REGION`, `TASK_ID` (runtime task/container identity), `ATTENDEE_EXPORTS_BUCKET` (Terraform output), `CLOUDWATCH_METRICS_NAMESPACE=EventFlow/Operations`, and `SERVICE_NAME=eventflow-api`.

Run `terraform init`, `terraform plan -var='log_delivery_role_name=eventflow-preview-api-execution'`, review the plan, then `terraform apply`. Register a new API task definition revision with the role and environment values above, then update the `eventflow-preview-api` service to that revision. Configure the API runtime's stdout/stderr log driver (for example ECS `awslogs`) to use the Terraform output `application_log_group`. Set the stream prefix to the service/task identity. Structured API and EMF records carry `requestId` when available and `taskId`; expiry sweep messages carry their `jobId` and `taskId`.

The dashboard URL is emitted as `dashboard_url`. It contains exactly four widgets:

| Widget | CloudWatch metric / statistic | Source |
| --- | --- | --- |
| Booking latency p95 (ms) | `BookingLatencyMs`, p95 | One raw sample per `POST /api/reservations` request; all instances share the `Service` dimension and the endpoint is recorded in each log event |
| Sold-out request count | `CapacityConflict`, Sum | One event for each capacity-conflict response |
| Idempotency replay count | `DuplicateReplay`, Sum | One event after a prior response is successfully replayed |
| PostgreSQL connections | `DbConnectionCount`, Maximum | `pg_stat_activity` sample every 30 seconds |

The replay alarm uses that same `DuplicateReplay` Sum series: threshold **3 events in 60 seconds**, one period to alarm, expected detection about **1–2 minutes** after the third event (metric/log delivery and evaluation delay). First response: inspect the alarm period's request IDs and sanitized API logs, verify the client is reusing keys only for retries, then check database contention and retry bursts. Alarm state is visible in CloudWatch; wire an SNS action if the class account has a notification topic.

## Private attendee CSV

The bucket blocks all public ACLs and bucket policies, enforces bucket-owner ownership and AES-256 server-side encryption. The API checks event ownership (ADMIN may inspect any event) before querying attendee rows or touching S3. It writes the CSV under a random temporary key, reads that object back for the existing download response, and deletes it; lifecycle expiry removes leftovers after one day. No presigned URL is created. Direct anonymous S3 access should return `403`.

For ST-037, test the existing organizer download button as the owning organizer (200 + CSV) and as a different organizer (403); separately open the bucket object URL anonymously and expect 403. The UI button remains at its existing endpoint.

## Exercise and handover evidence

1. Deploy the API with the bucket and CloudWatch environment variables, then make one successful reservation request with an `Idempotency-Key` and repeat the exact request with the same key. Expect the cached response and exactly one additional `DuplicateReplay` sample. (ST-039/ST-046.)
2. Capture the four-widget dashboard after traffic. Before sharing logs or screenshots, redact account IDs, customer fields, bearer tokens, OTPs, request payloads, and URLs. The application logger redacts URL strings and sensitive fields before writing them.
3. Save the dashboard URL, API base URL, and a demo organizer account through the course's approved handover channel. Do not put demo passwords in this repository or screenshots. Seed account names are documented in `backend/README.md`; use the deployment's rotated demo password.

## Cost estimate (class exercise)

Planning estimate, **not an account quote**: four custom metric series at the CloudWatch example rate of $0.30/metric-month is about **$1.20/month** before log ingestion/storage, alarm, and regional differences. At 1,000 CSV downloads/month, there are roughly 1,000 PUTs + 1,000 GETs (and deletes); the CSV objects are temporary, so ongoing storage should be negligible. Estimate actual charges from the target region, request volume and log volume in the [AWS CloudWatch pricing page](https://aws.amazon.com/cloudwatch/pricing/) and [AWS S3 pricing page](https://aws.amazon.com/s3/pricing/). This stack retains application logs for 14 days. The estimate excludes the existing compute/database, data transfer and tax.

## Cleanup

After saving evidence, first update the API task definition so it no longer references the task role created here. Then run `terraform destroy -var='log_delivery_role_name=eventflow-preview-api-execution'` from this directory and review the plan. This removes the dashboard, alarm, bucket, log group, policy, API task role, and role attachments. `force_destroy` is enabled for this dedicated temporary export bucket. Also stop the separately deployed API/database if they were created for the exercise; this Terraform stack does not own them. Confirm the plan targets only `eventflow-preview` resources before approving destruction.
