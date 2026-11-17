import { DemoUser, Event, Reservation, WaitlistEntry, Offer, StoreState } from './types';

export const INITIAL_USERS: DemoUser[] = [
  {
    id: 'user-1',
    name: 'Lê Minh Quân',
    email: 'quan.le@eventflow.vn',
    role: 'CUSTOMER',
    avatar:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    phone: '0901 234 567',
  },
  {
    id: 'user-2',
    name: 'Trần Thu Hà',
    email: 'ha.tran@eventflow.vn',
    role: 'CUSTOMER',
    avatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
    phone: '0912 345 678',
  },
  {
    id: 'user-3',
    name: 'Nguyễn Hoàng Nam',
    email: 'nam.nguyen@eventflow.vn',
    role: 'CUSTOMER',
    avatar:
      'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80',
    phone: '0923 456 789',
  },
  {
    id: 'user-org',
    name: 'Ban Tổ Chức Sài Gòn Events',
    email: 'organizer@eventflow.vn',
    role: 'ORGANIZER',
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    phone: '0988 888 999',
  },
];

export const INITIAL_EVENTS: Event[] = [
  {
    id: 'evt-1',
    slug: 'sunset-concert-2026',
    title: 'Đêm Nhạc Hoàng Hôn - Sunset Concert 2026',
    category: 'Âm nhạc',
    description:
      'Hòa mình vào không gian âm nhạc sống động trên bãi biển lúc hoàng hôn với sự tham gia của các nghệ sĩ acoustic hàng đầu Việt Nam. Một đêm nhạc đầy cảm xúc và kết nối.',
    venue: 'Sunset Bay Beach Club',
    address: 'Đường Trần Phú, Bãi Dài',
    city: 'Nha Trang',
    poster:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
    priceVnd: 450000,
    startsAt: '2026-12-25T18:00:00+07:00',
    salesCloseAt: '2026-12-25T17:00:00+07:00',
    capacity: 100,
    reservedCount: 1,
    soldCount: 65,
    organizerId: 'user-org',
    organizerName: 'Sài Gòn Events',
    nextWaitlistSeq: 1,
    featured: true,
  },
  {
    id: 'evt-2',
    slug: 'cloud-ai-summit-2026',
    title: 'Vietnam Cloud & AI Summit 2026',
    category: 'Công nghệ',
    description:
      'Hội nghị công nghệ thường niên quy tụ hơn 50 chuyên gia đầu ngành trong lĩnh vực Cloud Computing, Kiến trúc phân tán quy mô lớn và Trí tuệ nhân tạo thế hệ mới.',
    venue: 'Trung Tâm Hội Nghị Quốc Gia',
    address: 'Đại lộ Thăng Long, Mễ Trì, Nam Từ Liêm',
    city: 'Hà Nội',
    poster:
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
    priceVnd: 750000,
    startsAt: '2026-12-10T08:30:00+07:00',
    salesCloseAt: '2026-12-09T23:59:00+07:00',
    capacity: 80,
    reservedCount: 1,
    soldCount: 77,
    organizerId: 'user-org',
    organizerName: 'Tech Community VN',
    nextWaitlistSeq: 1,
    featured: true,
  },
  {
    id: 'evt-3',
    slug: 'soundwave-edm-festival',
    title: 'SoundWave EDM Festival - Cuồng Nhiệt Đêm Trắng',
    category: 'Âm nhạc',
    description:
      'Lễ hội âm nhạc điện tử bùng nổ nhất năm với dàn âm thanh vòm đỉnh cao quốc tế, sân khấu ánh sáng 3D visual mãn nhãn và line-up DJ đình đám.',
    venue: 'SECC - Trung tâm Hội chợ và Triển lãm Sài Gòn',
    address: '799 Nguyễn Văn Linh, Tân Phú, Quận 7',
    city: 'TP. Hồ Chí Minh',
    poster:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
    priceVnd: 680000,
    startsAt: '2026-12-31T20:00:00+07:00',
    salesCloseAt: '2026-12-31T18:00:00+07:00',
    capacity: 120,
    reservedCount: 0,
    soldCount: 120, // HẾT VÉ -> WAITLIST
    organizerId: 'user-org',
    organizerName: 'Sài Gòn Events',
    nextWaitlistSeq: 4,
    featured: true,
  },
  {
    id: 'evt-4',
    slug: 'artflow-contemporary-exhibition',
    title: 'Triển Lám Nghệ Thuật Đương Đại ArtFlow',
    category: 'Nghệ thuật',
    description:
      'Không gian tương tác đa giác quan kết hợp giữa mỹ thuật thị giác và công nghệ số, khám phá hành trình giao thoa giữa con người và thiên nhiên.',
    venue: 'Bảo Tàng Mỹ Thuật TP. Hồ Chí Minh',
    address: '97A Phó Đức Chính, Phường Nguyễn Thái Bình, Quận 1',
    city: 'TP. Hồ Chí Minh',
    poster:
      'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80',
    priceVnd: 220000,
    startsAt: '2026-11-28T09:00:00+07:00',
    salesCloseAt: '2026-11-28T17:00:00+07:00',
    capacity: 60,
    reservedCount: 1, // Đang giữ bởi user-1 để test checkout
    soldCount: 38,
    organizerId: 'user-org',
    organizerName: 'ArtFlow Studio',
    nextWaitlistSeq: 1,
  },
  {
    id: 'evt-5',
    slug: 'indie-night-acoustic-cafe',
    title: 'Đêm Nhạc Acoustic: Giai Điệu Ký Ức',
    category: 'Âm nhạc',
    description:
      'Đêm nhạc acoustic ấm áp trong không gian nhà hát mini cổ kính. Vé đã bán hết, hệ thống cấp quyền mua vé xoay vòng tự động khi có vé trả lại.',
    venue: 'Nhà Hát Kịch Nhỏ 5B',
    address: '5B Võ Văn Tần, Phường 6, Quận 3',
    city: 'TP. Hồ Chí Minh',
    poster:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=800&q=80',
    priceVnd: 350000,
    startsAt: '2026-12-05T19:30:00+07:00',
    salesCloseAt: '2026-12-05T18:00:00+07:00',
    capacity: 50,
    reservedCount: 1, // Vé đang dành riêng cho offer của user-1
    soldCount: 49,
    organizerId: 'user-org',
    organizerName: 'Sài Gòn Events',
    nextWaitlistSeq: 3,
  },
  {
    id: 'evt-6',
    slug: 'marathon-mua-thu-vietnam',
    title: 'Giải Chạy Bán Marathon Mùa Thu 2026',
    category: 'Thể thao',
    description:
      'Cung đường chạy ven hồ lãng mạn qua các địa danh lịch sử nổi tiếng tại thủ đô Hà Nội. Thử thách bản thân ở cự ly 10km và 21km chuẩn quốc tế.',
    venue: 'Khu Đô Thị Ecopark & Hồ Tây',
    address: 'Khu Đô Thị Ecopark, Văn Giang',
    city: 'Hà Nội',
    poster:
      'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=800&q=80',
    priceVnd: 550000,
    startsAt: '2026-11-22T05:30:00+07:00',
    salesCloseAt: '2026-11-21T20:00:00+07:00',
    capacity: 200,
    reservedCount: 0,
    soldCount: 142,
    organizerId: 'user-org',
    organizerName: 'Vietnam Running Club',
    nextWaitlistSeq: 1,
  },
  {
    id: 'evt-7',
    slug: 'workshop-ui-ux-design-systems',
    title: 'Workshop: Xây Dựng Design System Chuyên Nghiệp',
    category: 'Hội thảo',
    description:
      'Khóa huấn luyện chuyên sâu thực chiến 1 ngày về thiết kế hệ thống giao diện số, tối ưu hóa workflow giữa Designer và Frontend Engineer.',
    venue: 'Toong Coworking Space',
    address: '126 Nguyễn Thị Minh Khai, Quận 3',
    city: 'TP. Hồ Chí Minh',
    poster:
      'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=800&q=80',
    priceVnd: 490000,
    startsAt: '2026-12-15T09:00:00+07:00',
    salesCloseAt: '2026-12-14T18:00:00+07:00',
    capacity: 35,
    reservedCount: 0,
    soldCount: 35, // HẾT VÉ
    organizerId: 'user-org',
    organizerName: 'Design Systems VN',
    nextWaitlistSeq: 2,
  },
  {
    id: 'evt-8',
    slug: 'kich-noi-chuyen-pho-cu',
    title: 'Kịch Nói Đương Đại: Chuyện Phố Cũ',
    category: 'Kịch nghệ',
    description:
      'Vở kịch sân khấu tái hiện những câu chuyện đời thường dung dị nhưng sâu lắng về tình người, ký ức và sự đổi thay của nhịp sống phố thị.',
    venue: 'Nhà Hát Tuổi Trẻ',
    address: '11 Ngô Thì Nhậm, Hai Bà Trưng',
    city: 'Hà Nội',
    poster:
      'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=800&q=80',
    priceVnd: 280000,
    startsAt: '2026-12-18T20:00:00+07:00',
    salesCloseAt: '2026-12-18T18:30:00+07:00',
    capacity: 70,
    reservedCount: 2,
    soldCount: 45,
    organizerId: 'user-org',
    organizerName: 'Sân Khấu Tuổi Trẻ',
    nextWaitlistSeq: 1,
  },
];

// Helper để tạo mốc thời gian tương lai chuẩn ISO
const makeFutureIso = (minutesFromNow: number): string => {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
};

export const INITIAL_RESERVATIONS: Reservation[] = [
  // Vé đã xác nhận của user-1 (Sự kiện Sunset Concert)
  {
    id: 'res-confirmed-1',
    eventId: 'evt-1',
    userId: 'user-1',
    source: 'DIRECT',
    status: 'CONFIRMED',
    priceVnd: 450000,
    expiresAt: '2026-12-25T17:00:00Z',
    confirmedAt: '2026-11-14T10:15:00Z',
    createdAt: '2026-11-14T10:05:00Z',
    ticketCode: 'EVT-TKT-98214',
  },
  // Vé đang HOLD của user-1 (Sự kiện Triển lãm ArtFlow, còn 8 phút để test checkout)
  {
    id: 'res-hold-1',
    eventId: 'evt-4',
    userId: 'user-1',
    source: 'DIRECT',
    status: 'HOLD',
    priceVnd: 220000,
    expiresAt: makeFutureIso(8), // 8 phút từ lúc khởi tạo
    createdAt: new Date().toISOString(),
  },
  // Reservation gắn với offer của user-1 (Sự kiện Đêm nhạc Acoustic)
  {
    id: 'res-offer-1',
    eventId: 'evt-5',
    userId: 'user-1',
    source: 'WAITLIST_OFFER',
    status: 'HOLD',
    priceVnd: 350000,
    expiresAt: makeFutureIso(4), // 4 phút từ lúc khởi tạo
    createdAt: new Date().toISOString(),
  },
];

export const INITIAL_WAITLIST: WaitlistEntry[] = [
  // Danh sách chờ của sự kiện EDM SoundWave: user-2 (#1), user-3 (#2), user-1 (#3)
  {
    id: 'wl-1',
    eventId: 'evt-3',
    userId: 'user-2',
    sequenceNo: 1,
    status: 'WAITING',
    joinedAt: '2026-11-14T14:00:00Z',
  },
  {
    id: 'wl-2',
    eventId: 'evt-3',
    userId: 'user-3',
    sequenceNo: 2,
    status: 'WAITING',
    joinedAt: '2026-11-14T14:15:00Z',
  },
  {
    id: 'wl-3',
    eventId: 'evt-3',
    userId: 'user-1',
    sequenceNo: 3,
    status: 'WAITING', // user-1 đang ở vị trí #3!
    joinedAt: '2026-11-14T14:30:00Z',
  },
  // Danh sách chờ sự kiện Acoustic: user-1 được cấp OFFERED
  {
    id: 'wl-4',
    eventId: 'evt-5',
    userId: 'user-1',
    sequenceNo: 1,
    status: 'OFFERED',
    joinedAt: '2026-11-14T09:00:00Z',
  },
  {
    id: 'wl-5',
    eventId: 'evt-5',
    userId: 'user-2',
    sequenceNo: 2,
    status: 'WAITING', // Người tiếp theo nhận offer nếu user-1 từ chối hoặc hết hạn!
    joinedAt: '2026-11-14T09:10:00Z',
  },
];

export const INITIAL_OFFERS: Offer[] = [
  // Quyền mua vé có thời hạn của user-1 (Sự kiện Acoustic)
  {
    id: 'offer-1',
    reservationId: 'res-offer-1',
    waitlistEntryId: 'wl-4',
    eventId: 'evt-5',
    userId: 'user-1',
    status: 'PENDING',
    expiresAt: makeFutureIso(4), // 4 phút còn lại
    createdAt: new Date().toISOString(),
  },
];

export const getInitialState = (): StoreState => ({
  currentUser: INITIAL_USERS[0], // user-1 (Lê Minh Quân)
  users: INITIAL_USERS,
  events: INITIAL_EVENTS,
  reservations: INITIAL_RESERVATIONS,
  waitlistEntries: INITIAL_WAITLIST,
  offers: INITIAL_OFFERS,
  activeScenario: 'DEFAULT',
});
