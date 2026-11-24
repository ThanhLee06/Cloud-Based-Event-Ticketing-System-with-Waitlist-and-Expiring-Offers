# ===================== ST-036 · IAM =====================
# Tách 2 loại quyền đúng yêu cầu:
#  - Execution role ("tiến trình khởi động"): ECS dùng để kéo image và lấy bí mật bơm vào container.
#  - Task role ("ứng dụng"): quyền code NestJS dùng khi chạy — chỉ đọc/ghi đúng thư mục trong kho S3.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

locals {
  ecs_tasks_trust = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      # Chỉ ECS của chính tài khoản này được nhận role (chống "confused deputy").
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
    }]
  })

  # Bí mật mỗi tác vụ được đọc: API chỉ đọc bí mật của API; migrate cần cả 2
  # (APP_DATABASE_URL nằm trong bí mật API để cấp quyền cho user ứng dụng).
  execution_secret_access = {
    api     = [aws_secretsmanager_secret.runtime["api"].arn]
    migrate = [aws_secretsmanager_secret.runtime["migration"].arn, aws_secretsmanager_secret.runtime["api"].arn]
  }

  uploads_enabled = var.uploads_bucket_arn != null
}

# ----- Execution role (tiến trình khởi động) -----

resource "aws_iam_role" "execution" {
  for_each = local.execution_secret_access

  name               = "${var.name_prefix}-${each.key}-execution"
  assume_role_policy = local.ecs_tasks_trust
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution_ecs" {
  for_each = aws_iam_role.execution

  role       = each.value.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  for_each = aws_iam_role.execution

  name = "read-own-runtime-secrets"
  role = each.value.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "ReadOnlyThisTaskSecrets"
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = local.execution_secret_access[each.key]
    }]
  })
}

# ----- Task role của NestJS (ứng dụng) -----

resource "aws_iam_role" "api_task" {
  name               = "${var.name_prefix}-api-task"
  assume_role_policy = local.ecs_tasks_trust
  tags               = var.tags
}

resource "aws_iam_role_policy" "api_task_uploads" {
  count = local.uploads_enabled ? 1 : 0

  name = "uploads-prefix-only"
  role = aws_iam_role.api_task.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid      = "ReadWriteUploadsPrefixOnly"
          Effect   = "Allow"
          Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
          Resource = "${var.uploads_bucket_arn}/${var.uploads_prefix}*"
        },
        {
          Sid       = "ListUploadsPrefixOnly"
          Effect    = "Allow"
          Action    = ["s3:ListBucket"]
          Resource  = var.uploads_bucket_arn
          Condition = { StringLike = { "s3:prefix" = ["${var.uploads_prefix}*"] } }
        }
      ],
      var.uploads_kms_key_arn == null ? [] : [
        {
          Sid      = "UseUploadsKmsKey"
          Effect   = "Allow"
          Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
          Resource = var.uploads_kms_key_arn
        }
      ]
    )
  })
}
