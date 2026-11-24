# ===================== ST-036 · Security Group =====================
# PostgreSQL chỉ nhận kết nối từ máy chủ NestJS và tác vụ migrate chạy một lần — không mở ra Internet.
# Mọi luật viết tường minh; Terraform xóa luật "cho ra mọi nơi" mặc định của AWS.

resource "aws_security_group" "api" {
  name        = "${var.name_prefix}-api"
  description = "NestJS API tasks"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name_prefix}-api" })
}

resource "aws_security_group" "migrate" {
  name        = "${var.name_prefix}-migrate"
  description = "One-off Prisma migration and seed tasks"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name_prefix}-migrate" })
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db"
  description = "Private PostgreSQL, reachable only from API and migration tasks"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name_prefix}-db" })
}

locals {
  db_clients = {
    api     = aws_security_group.api.id
    migrate = aws_security_group.migrate.id
  }
}

# --- PostgreSQL: chỉ 2 nguồn được vào cổng 5432 ---
resource "aws_vpc_security_group_ingress_rule" "db_from_clients" {
  for_each = local.db_clients

  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL from ${each.key} tasks"
  tags                         = var.tags
}

resource "aws_vpc_security_group_egress_rule" "clients_to_db" {
  for_each = local.db_clients

  security_group_id            = each.value
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "To private PostgreSQL"
  tags                         = var.tags
}

# --- HTTPS ra ngoài: kéo image ECR, đọc Secrets Manager, ghi CloudWatch Logs, tải JWKS của Cognito ---
resource "aws_vpc_security_group_egress_rule" "clients_https" {
  for_each = local.db_clients

  security_group_id = each.value
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS to AWS APIs (ECR, Secrets Manager, Logs, Cognito JWKS)"
  tags              = var.tags
}

# --- Load Balancer → NestJS (chỉ Load Balancer gọi được cổng API) ---
resource "aws_vpc_security_group_ingress_rule" "api_from_load_balancer" {
  count = var.load_balancer_security_group_id == null ? 0 : 1

  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = var.load_balancer_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = var.api_port
  to_port                      = var.api_port
  description                  = "API traffic from the load balancer"
  tags                         = var.tags
}

resource "aws_vpc_security_group_egress_rule" "load_balancer_to_api" {
  count = var.load_balancer_security_group_id != null && var.manage_load_balancer_egress ? 1 : 0

  security_group_id            = var.load_balancer_security_group_id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = var.api_port
  to_port                      = var.api_port
  description                  = "Load balancer to NestJS API"
  tags                         = var.tags
}
