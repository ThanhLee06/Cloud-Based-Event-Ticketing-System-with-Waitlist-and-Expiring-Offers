# ===================== ST-036 · Amazon Cognito =====================
# Người dùng đăng nhập bằng email. Tự đăng ký được (backend luôn gán vai trò Sinh viên/CUSTOMER);
# vai trò Ban tổ chức / Quản trị viên lưu trong PostgreSQL và do Admin cấp ở trang /admin.

resource "aws_cognito_user_pool" "this" {
  name                     = "${var.name_prefix}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  # Gửi mã xác thực bằng email mặc định của Cognito (miễn phí, giới hạn số email/ngày) — đủ cho đồ án.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Mã xác thực EventFlow"
    email_message        = "Mã xác thực email EventFlow của bạn là {####}. Mã có hiệu lực trong 24 giờ."
  }

  tags = var.tags
}

resource "aws_cognito_user_pool_domain" "this" {
  domain                = var.cognito_domain_prefix
  user_pool_id          = aws_cognito_user_pool.this.id
  managed_login_version = 1 # Hosted UI cổ điển, không cần cấu hình giao diện riêng.
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  # Web chạy trên trình duyệt → public client, không có secret; bảo vệ bằng PKCE.
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = [for u in var.app_base_urls : "${u}/auth/callback"]
  logout_urls   = [for u in var.app_base_urls : "${u}/login"]

  explicit_auth_flows = concat(
    ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"],
    var.enable_password_auth_flow ? ["ALLOW_USER_PASSWORD_AUTH"] : []
  )

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 7
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  read_attributes  = ["email", "email_verified", "name"]
  write_attributes = ["email", "name"]
}
