/**
 * Định dạng tiền VND chuẩn Việt Nam
 * Ví dụ: 350000 -> "350.000 ₫"
 */
export const formatVND = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
};

/**
 * Định dạng ngày giờ chuẩn tiếng Việt theo múi giờ Asia/Ho_Chi_Minh
 * Ví dụ: "18:00, 25/12/2026"
 */
export const formatDateVN = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false,
    });
    return formatter.format(date);
  } catch {
    return isoString;
  }
};

/**
 * Định dạng ngày giờ ngắn cho thẻ sự kiện (EventCard)
 * Ví dụ: { weekdayDate: "T6, 25/12", timeStr: "18:00" }
 */
export const formatEventDateCard = (
  isoString: string
): { weekdayDate: string; timeStr: string; fullDateVN: string } => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return { weekdayDate: isoString, timeStr: '', fullDateVN: isoString };
    }

    const dayFormatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });

    const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const fullFormatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    return {
      weekdayDate: dayFormatter.format(date),
      timeStr: timeFormatter.format(date),
      fullDateVN: fullFormatter.format(date),
    };
  } catch {
    return { weekdayDate: isoString, timeStr: '', fullDateVN: isoString };
  }
};

/**
 * Định dạng ngày ngắn
 * Ví dụ: "25/12/2026"
 */
export const formatDateShort = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoString;
  }
};

/**
 * Định dạng số giây đếm ngược còn lại thành "MM:SS"
 */
export const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
