terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.aws_region }

resource "aws_s3_bucket" "attendee_exports" {
  bucket_prefix = "${var.name_prefix}-attendee-exports-"
  force_destroy = true
  tags          = { Project = "EventFlow", DataClass = "Sensitive" }
}

resource "aws_s3_bucket_public_access_block" "attendee_exports" {
  bucket                  = aws_s3_bucket.attendee_exports.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "attendee_exports" {
  bucket = aws_s3_bucket.attendee_exports.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "attendee_exports" {
  bucket = aws_s3_bucket.attendee_exports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "attendee_exports" {
  bucket = aws_s3_bucket.attendee_exports.id
  rule {
    id     = "expire-temporary-exports"
    status = "Enabled"
    filter { prefix = "exports/" }
    expiration { days = 1 }
  }
}

resource "aws_cloudwatch_log_group" "application" {
  name              = "/eventflow/${var.name_prefix}/application"
  retention_in_days = 14
}

resource "aws_iam_role" "api_task" {
  name = "${var.name_prefix}-api-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Action    = "sts:AssumeRole",
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
  tags = { Project = "EventFlow", Purpose = "API task runtime" }
}

resource "aws_iam_policy" "runtime" {
  name_prefix = "${var.name_prefix}-eventflow-runtime-"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.attendee_exports.arn}/exports/*" }
    ]
  })
}

resource "aws_iam_policy" "log_delivery" {
  name_prefix = "${var.name_prefix}-eventflow-log-delivery-"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"],
      Resource = "${aws_cloudwatch_log_group.application.arn}:*"
    }]
  })
}

# Application code receives only the API task role. ECS log delivery uses the
# existing task execution role supplied by the deployment owner.
resource "aws_iam_role_policy_attachment" "runtime" {
  role       = aws_iam_role.api_task.name
  policy_arn = aws_iam_policy.runtime.arn
}

resource "aws_iam_role_policy_attachment" "log_delivery" {
  role       = var.log_delivery_role_name
  policy_arn = aws_iam_policy.log_delivery.arn
}

resource "aws_cloudwatch_metric_alarm" "duplicate_replays" {
  alarm_name          = "${var.name_prefix}-duplicate-replays-exercise"
  alarm_description   = "3+ replayed reservation requests in one 60-second period. First response: inspect requestId logs and confirm client retry behavior; then check Idempotency-Key reuse and DB contention."
  namespace           = var.metrics_namespace
  metric_name         = "DuplicateReplay"
  dimensions          = { Service = var.service_name }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_dashboard" "operations" {
  dashboard_name = "${var.name_prefix}-operations"
  dashboard_body = jsonencode({
    widgets = [
      { type = "metric", x = 0, y = 0, width = 12, height = 6, properties = {
        title   = "Booking p95 latency (ms) — raw per-request samples, all instances",
        view    = "timeSeries", region = var.aws_region, period = 60, stat = "p95",
        metrics = [[var.metrics_namespace, "BookingLatencyMs", "Service", var.service_name]]
      } },
      { type = "metric", x = 12, y = 0, width = 12, height = 6, properties = {
        title   = "Requests rejected: sold out", view = "timeSeries", region = var.aws_region, period = 60, stat = "Sum",
        metrics = [[var.metrics_namespace, "CapacityConflict", "Service", var.service_name]]
      } },
      { type = "metric", x = 0, y = 6, width = 12, height = 6, properties = {
        title   = "Idempotency replays per period (alarm source)", view = "timeSeries", region = var.aws_region, period = 60, stat = "Sum",
        metrics = [[var.metrics_namespace, "DuplicateReplay", "Service", var.service_name]]
      } },
      { type = "metric", x = 12, y = 6, width = 12, height = 6, properties = {
        title   = "PostgreSQL connections", view = "timeSeries", region = var.aws_region, period = 60, stat = "Maximum",
        metrics = [[var.metrics_namespace, "DbConnectionCount", "Service", var.service_name]]
      } }
    ]
  })
}

output "attendee_exports_bucket" { value = aws_s3_bucket.attendee_exports.bucket }
output "application_log_group" { value = aws_cloudwatch_log_group.application.name }
output "dashboard_url" { value = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.operations.dashboard_name}" }
output "runtime_policy_arn" { value = aws_iam_policy.runtime.arn }
output "log_delivery_policy_arn" { value = aws_iam_policy.log_delivery.arn }
output "api_task_role_name" { value = aws_iam_role.api_task.name }
output "api_task_role_arn" { value = aws_iam_role.api_task.arn }
