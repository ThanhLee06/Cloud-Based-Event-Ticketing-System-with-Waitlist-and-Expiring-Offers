/** Lấy token từ header "Authorization: Bearer <token>"; null nếu thiếu hoặc sai định dạng. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : null;
}
