data "aws_vpc" "preview" {
  default = true
}

data "aws_subnets" "preview_tasks" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.preview.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_subnet" "preview_tasks" {
  for_each = toset(data.aws_subnets.preview_tasks.ids)
  id       = each.key
}

locals {
  preview_db_zones = slice(sort(distinct([for subnet in data.aws_subnet.preview_tasks : subnet.availability_zone])), 0, 2)
}

resource "aws_subnet" "preview_db" {
  for_each = toset(local.preview_db_zones)

  vpc_id            = data.aws_vpc.preview.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(data.aws_vpc.preview.cidr_block, 8, 250 + index(local.preview_db_zones, each.key))
  tags              = merge(local.tags, { Name = "eventflow-preview-db-${each.key}" })
}

resource "aws_route_table" "preview_db" {
  vpc_id = data.aws_vpc.preview.id
  tags   = merge(local.tags, { Name = "eventflow-preview-db-private" })
}

resource "aws_route_table_association" "preview_db" {
  for_each = aws_subnet.preview_db

  subnet_id      = each.value.id
  route_table_id = aws_route_table.preview_db.id
}

resource "aws_security_group" "preview_api" {
  name        = "eventflow-preview-api"
  description = "Preview API and migration tasks"
  vpc_id      = data.aws_vpc.preview.id
  tags        = local.tags
}

resource "aws_security_group" "preview_db" {
  name        = "eventflow-preview-db"
  description = "Private PostgreSQL for preview"
  vpc_id      = data.aws_vpc.preview.id
  tags        = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "preview_db" {
  security_group_id            = aws_security_group.preview_db.id
  referenced_security_group_id = aws_security_group.preview_api.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "preview_api_db" {
  security_group_id            = aws_security_group.preview_api.id
  referenced_security_group_id = aws_security_group.preview_db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "preview_api_tls" {
  security_group_id = aws_security_group.preview_api.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_db_subnet_group" "preview" {
  name       = "eventflow-preview-db"
  subnet_ids = [for subnet in aws_subnet.preview_db : subnet.id]
  tags       = local.tags

  depends_on = [aws_route_table_association.preview_db]
}

resource "aws_db_instance" "preview" {
  identifier                  = "eventflow-preview-db"
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = "db.t4g.micro"
  db_name                     = "eventflow"
  username                    = "eventflow_owner"
  manage_master_user_password = true
  allocated_storage           = 20
  storage_type                = "gp3"
  storage_encrypted           = true
  publicly_accessible         = false
  db_subnet_group_name        = aws_db_subnet_group.preview.name
  vpc_security_group_ids      = [aws_security_group.preview_db.id]
  backup_retention_period     = 1
  final_snapshot_identifier   = "eventflow-preview-db-final"
  tags                        = local.tags
}

resource "aws_secretsmanager_secret" "preview_runtime" {
  for_each = toset(["api", "migration"])

  name = "eventflow/preview/${each.key}"
  tags = local.tags
}
