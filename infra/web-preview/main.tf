terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "eventflow-tfstate-sydney-q7m4"
    key          = "eventflow/web-preview/terraform.tfstate"
    region       = "ap-southeast-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-southeast-2"
}

variable "web_image_digest" {
  description = "Published frontend image digest in eventflow-web."
  type        = string

  validation {
    condition     = can(regex("^sha256:[0-9a-f]{64}$", var.web_image_digest))
    error_message = "Use the sha256 digest reported by the frontend image repository."
  }
}

locals {
  name = "eventflow-web-preview"
  tags = {
    Project     = "EventFlow"
    Environment = "preview"
  }
  roles = {
    execution = {
      service = "ecs-tasks.amazonaws.com"
      policy  = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    }
    infrastructure = {
      service = "ecs.amazonaws.com"
      policy  = "arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices"
    }
  }
}

data "aws_ecr_repository" "web" {
  name = "eventflow-web"
}

resource "aws_iam_role" "preview" {
  for_each = local.roles

  name = "${local.name}-${each.key}"
  tags = local.tags
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = each.value.service }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "preview" {
  for_each = local.roles

  role       = aws_iam_role.preview[each.key].name
  policy_arn = each.value.policy
}

resource "aws_ecs_express_gateway_service" "preview" {
  service_name            = local.name
  cluster                 = "eventflow-staging"
  execution_role_arn      = aws_iam_role.preview["execution"].arn
  infrastructure_role_arn = aws_iam_role.preview["infrastructure"].arn
  cpu                     = "256"
  memory                  = "512"
  health_check_path       = "/"
  tags                    = local.tags

  primary_container {
    image          = "${data.aws_ecr_repository.web.repository_url}@${var.web_image_digest}"
    container_port = 3000
  }

  scaling_target {
    min_task_count            = 1
    max_task_count            = 1
    auto_scaling_metric       = "AVERAGE_CPU"
    auto_scaling_target_value = 60
  }

  lifecycle {
    ignore_changes = [primary_container[0].image]
  }

  depends_on = [aws_iam_role_policy_attachment.preview]
}

output "preview_endpoint" {
  description = "Public endpoint allocated to the preview."
  value       = try(aws_ecs_express_gateway_service.preview.ingress_paths[0].endpoint, null)
}
