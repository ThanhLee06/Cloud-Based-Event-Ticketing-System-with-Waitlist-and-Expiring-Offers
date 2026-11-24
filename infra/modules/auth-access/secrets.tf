# ===================== ST-036 · AWS Secrets Manager =====================
# Terraform chỉ tạo "ngăn chứa" bí mật. Giá trị thật đưa vào bằng AWS CLI (xem README) để
# mật khẩu không nằm trong mã nguồn, trong file trạng thái Terraform hay trong bản đóng gói Docker.

resource "aws_secretsmanager_secret" "runtime" {
  for_each = {
    api       = "Biến bí mật cho NestJS: DATABASE_URL (user ứng dụng), JWT_SECRET, INTERNAL_JOB_SECRET"
    migration = "Biến bí mật cho tác vụ migrate: DATABASE_URL (user chủ sở hữu DB), APP_DATABASE_URL"
  }

  name                    = "${var.name_prefix}/${each.key}"
  description             = each.value
  recovery_window_in_days = 7
  tags                    = var.tags
}
