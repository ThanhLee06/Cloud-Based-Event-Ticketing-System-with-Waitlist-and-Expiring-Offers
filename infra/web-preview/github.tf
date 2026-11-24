data "aws_caller_identity" "preview" {}

locals {
  aws_ecs               = "arn:aws:ecs:ap-southeast-2:${data.aws_caller_identity.preview.account_id}"
  github_preview_repo   = "ThanhLee06@181952495/Cloud-Based-Event-Ticketing-System-with-Waitlist-and-Expiring-Offers@1457934518"
  github_preview_branch = "deploy"
}

resource "aws_iam_openid_connect_provider" "preview_github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = local.tags
}

resource "aws_iam_role" "preview_github" {
  name = "eventflow-preview-github-deploy"
  tags = local.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = aws_iam_openid_connect_provider.preview_github.arn }
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = "repo:${local.github_preview_repo}:ref:refs/heads/${local.github_preview_branch}"
      } }
    }]
  })
}

resource "aws_iam_role_policy" "preview_github" {
  name = "deploy-eventflow-preview"
  role = aws_iam_role.preview_github.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken", "ecs:DescribeTaskDefinition", "ecs:DescribeTasks", "ecs:DescribeServiceDeployments", "ecs:RegisterTaskDefinition"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:CompleteLayerUpload", "ecr:DescribeImages", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart"]
        Resource = [data.aws_ecr_repository.api.arn, data.aws_ecr_repository.web.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["ecs:DescribeServices", "ecs:ListServiceDeployments", "ecs:UpdateService", "ecs:DescribeExpressGatewayService", "ecs:UpdateExpressGatewayService"]
        Resource = ["${local.aws_ecs}:service/eventflow-staging/${local.api_service_name}", aws_ecs_express_gateway_service.preview.service_arn]
      },
      {
        Effect    = "Allow"
        Action    = ["ecs:RunTask"]
        Resource  = "${local.aws_ecs}:task-definition/eventflow-preview-migrate:*"
        Condition = { ArnEquals = { "ecs:cluster" = "${local.aws_ecs}:cluster/eventflow-staging" } }
      },
      {
        Effect    = "Allow"
        Action    = ["iam:PassRole"]
        Resource  = concat([for r in aws_iam_role.preview_api : r.arn], [for r in aws_iam_role.preview : r.arn])
        Condition = { StringEquals = { "iam:PassedToService" = ["ecs-tasks.amazonaws.com", "ecs.amazonaws.com"] } }
      }
    ]
  })
}
