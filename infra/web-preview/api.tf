data "aws_ecr_repository" "api" {
  name = "eventflow-api"
}

data "aws_lb" "preview" {
  name = "ecs-express-gateway-alb-1fff636c"
}

data "aws_lb_listener" "preview" {
  load_balancer_arn = data.aws_lb.preview.arn
  port              = 443
}

locals {
  api_service_name     = "eventflow-preview-api"
  preview_host         = trimprefix(aws_ecs_express_gateway_service.preview.ingress_paths[0].endpoint, "https://")
  preview_alb_group_id = one(data.aws_lb.preview.security_groups)
  api_image            = "${data.aws_ecr_repository.api.repository_url}@sha256:3d00cc928261a9cd643cea53b9792ce7c6e291712c6a4ec17e2ef27cb34322dc"
  api_tasks = {
    api = {
      command = null
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.preview_runtime["api"].arn}:DATABASE_URL::" },
        { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.preview_runtime["api"].arn}:JWT_SECRET::" },
      ]
    }
    migrate = {
      command = ["node", "-e", file("${path.module}/prepare-db.cjs")]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.preview_runtime["migration"].arn}:DATABASE_URL::" },
        { name = "APP_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.preview_runtime["api"].arn}:DATABASE_URL::" },
      ]
    }
  }
}

resource "aws_vpc_security_group_ingress_rule" "preview_api" {
  security_group_id            = aws_security_group.preview_api.id
  referenced_security_group_id = local.preview_alb_group_id
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
}

resource "aws_vpc_security_group_egress_rule" "preview_edge_api" {
  security_group_id            = local.preview_alb_group_id
  referenced_security_group_id = aws_security_group.preview_api.id
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
}

resource "aws_lb_target_group" "preview_api" {
  name        = local.api_service_name
  port        = 4000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = data.aws_vpc.preview.id
  tags        = local.tags

  health_check {
    path = "/api/health"
  }
}

resource "aws_lb_listener_rule" "preview_block_internal" {
  listener_arn = data.aws_lb_listener.preview.arn
  priority     = 10

  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      status_code  = "403"
    }
  }

  condition {
    host_header {
      values = [local.preview_host]
    }
  }

  condition {
    path_pattern {
      regex_values = ["^/[aA][pP][iI]/[iI][nN][tT][eE][rR][nN][aA][lL](/.*)?$"]
    }
  }
}

resource "aws_lb_listener_rule" "preview_api" {
  listener_arn = data.aws_lb_listener.preview.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.preview_api.arn
  }

  condition {
    host_header {
      values = [local.preview_host]
    }
  }

  condition {
    path_pattern {
      values = ["/api", "/api/*"]
    }
  }
}

resource "aws_cloudwatch_log_group" "preview_api" {
  name              = "/ecs/eventflow-preview/api"
  retention_in_days = 7
  tags              = local.tags
}

resource "aws_iam_role" "preview_api" {
  for_each           = local.api_tasks
  name               = "eventflow-preview-${each.key}-execution"
  assume_role_policy = aws_iam_role.preview["execution"].assume_role_policy
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "preview_api" {
  for_each   = aws_iam_role.preview_api
  role       = each.value.name
  policy_arn = local.roles.execution.policy
}

resource "aws_iam_role_policy" "preview_api_secrets" {
  for_each = aws_iam_role.preview_api
  name     = "read-preview-task-secrets"
  role     = each.value.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = each.key == "api" ? [aws_secretsmanager_secret.preview_runtime["api"].arn] : [for s in aws_secretsmanager_secret.preview_runtime : s.arn]
    }]
  })
}

resource "aws_ecs_task_definition" "preview_api" {
  for_each = local.api_tasks

  family                   = "eventflow-preview-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.preview_api[each.key].arn
  tags                     = local.tags

  container_definitions = jsonencode([{
    name         = each.key
    image        = local.api_image
    essential    = true
    command      = each.value.command
    portMappings = each.key == "api" ? [{ containerPort = 4000, protocol = "tcp" }] : []
    environment = each.key == "api" ? [
      { name = "CORS_ORIGIN", value = "https://${local.preview_host}" },
      { name = "TRUST_PROXY", value = "true" },
      { name = "LOCAL_EXPIRY_SWEEP_ENABLED", value = "true" }
    ] : []
    secrets = each.value.secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.preview_api.name
        awslogs-region        = "ap-southeast-2"
        awslogs-stream-prefix = each.key
      }
    }
  }])

  depends_on = [aws_iam_role_policy_attachment.preview_api, aws_iam_role_policy.preview_api_secrets]
}

resource "aws_ecs_service" "preview_api" {
  name                              = local.api_service_name
  cluster                           = "eventflow-staging"
  task_definition                   = aws_ecs_task_definition.preview_api["api"].arn
  launch_type                       = "FARGATE"
  desired_count                     = 0
  health_check_grace_period_seconds = 60
  tags                              = local.tags

  network_configuration {
    subnets          = data.aws_subnets.preview_tasks.ids
    security_groups  = [aws_security_group.preview_api.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.preview_api.arn
    container_name   = "api"
    container_port   = 4000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener_rule.preview_api, aws_vpc_security_group_egress_rule.preview_edge_api]
}
