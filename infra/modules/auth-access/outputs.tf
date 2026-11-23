# ===================== ST-036 · Đầu ra cho ST-045 / ST-042 / ST-048 =====================

output "security_group_ids" {
  description = "Gắn vào ECS: api cho service NestJS, migrate cho tác vụ chạy một lần, db cho RDS."
  value = {
    api     = aws_security_group.api.id
    migrate = aws_security_group.migrate.id
    db      = aws_security_group.db.id
  }
}

output "secret_arns" {
  description = "ARN bí mật dùng trong khối secrets.valueFrom của task definition."
  value       = { for k, s in aws_secretsmanager_secret.runtime : k => s.arn }
}

output "execution_role_arns" {
  description = "executionRoleArn cho task definition api / migrate."
  value       = { for k, r in aws_iam_role.execution : k => r.arn }
}

output "api_task_role_arn" {
  description = "taskRoleArn cho task definition api (quyền S3 thư mục uploads)."
  value       = aws_iam_role.api_task.arn
}

output "cognito" {
  description = "Thông tin Cognito (không bí mật)."
  value = {
    user_pool_id = aws_cognito_user_pool.this.id
    client_id    = aws_cognito_user_pool_client.web.id
    domain_url   = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
    issuer       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
  }
}

output "api_environment" {
  description = "Biến môi trường (không bí mật) cần thêm vào container NestJS để bật đăng nhập Cognito."
  value = [
    { name = "AUTH_MODE", value = "cognito" },
    { name = "COGNITO_REGION", value = data.aws_region.current.region },
    { name = "COGNITO_USER_POOL_ID", value = aws_cognito_user_pool.this.id },
    { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.web.id },
    { name = "COGNITO_DOMAIN", value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com" },
  ]
}
