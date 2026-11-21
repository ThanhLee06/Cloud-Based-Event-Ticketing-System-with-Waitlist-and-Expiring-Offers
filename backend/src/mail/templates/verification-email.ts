import type { MailMessage } from '../mail.service';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  );

/** Email chứa mã OTP 6 số để xác thực địa chỉ email khi đăng ký. */
export function buildVerificationEmail(params: {
  to: string;
  name: string;
  code: string;
  expiresInMinutes: number;
}): MailMessage {
  const { to, name, code, expiresInMinutes } = params;
  const safeName = escapeHtml(name);

  const text = [
    `Xin chào ${name},`,
    '',
    `Mã xác thực email EventFlow của bạn là: ${code}`,
    `Mã có hiệu lực trong ${expiresInMinutes} phút. Không chia sẻ mã này cho bất kỳ ai.`,
    '',
    'Nếu bạn không đăng ký tài khoản EventFlow, hãy bỏ qua email này.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="vi">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
      <tr><td style="padding:28px 28px 8px;">
        <div style="font-size:18px;font-weight:700;">EventFlow</div>
        <p style="font-size:15px;line-height:1.6;margin:20px 0 8px;">Xin chào ${safeName},</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">Mã xác thực email của bạn là:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;background:#f4f4f5;border-radius:8px;">${code}</div>
        <p style="font-size:13px;line-height:1.6;color:#52525b;margin:20px 0 0;">Mã có hiệu lực trong <strong>${expiresInMinutes} phút</strong>. Không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên EventFlow.</p>
      </td></tr>
      <tr><td style="padding:16px 28px 28px;font-size:12px;color:#71717a;">Nếu bạn không đăng ký tài khoản EventFlow, hãy bỏ qua email này.</td></tr>
    </table>
  </body>
</html>`;

  return {
    to,
    subject: `${code} là mã xác thực EventFlow của bạn`,
    text,
    html,
  };
}
