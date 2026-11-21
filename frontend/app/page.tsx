'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import EventCard from '@components/Card/EventCard';
import { getEvents, type EventListItem } from '@lib/api/events';
import { getApiErrorMessage } from '@lib/api/client';
import { formatEventDateCard } from '@lib/utils/format';
import { Search, X, MapPin, Calendar } from 'lucide-react';

/** Backend giới hạn limit tối đa 100. Bước này vẫn lọc phía client trên danh sách đã tải. */
const HOME_EVENTS_LIMIT = 100;

type EventsLoadState =
  | { status: 'loading' }
  | { status: 'success'; events: EventListItem[] }
  | { status: 'error'; message: string };

const HomePageContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // ST-011: Danh sách sự kiện lấy từ Backend (GET /api/events), không dùng Mock Store.
  const [loadState, setLoadState] = useState<EventsLoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getEvents({ page: 1, limit: HOME_EVENTS_LIMIT })
      .then((res) => {
        if (active) setLoadState({ status: 'success', events: res.data });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadState({
          status: 'error',
          message: getApiErrorMessage(err, 'Không thể tải danh sách sự kiện. Vui lòng thử lại.'),
        });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const events = useMemo(
    () => (loadState.status === 'success' ? loadState.events : []),
    [loadState]
  );

  const retryLoadEvents = () => {
    setLoadState({ status: 'loading' });
    setReloadKey((k) => k + 1);
  };

  // F14: Initialize from URL search parameters
  const initialQ = searchParams?.get('q') || '';
  const initialCategory = searchParams?.get('category') || 'ALL';
  const initialCity = searchParams?.get('city') || 'ALL';
  const initialAvailability =
    (searchParams?.get('availability') as 'ALL' | 'AVAILABLE' | 'SOLD_OUT') || 'ALL';

  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedCity, setSelectedCity] = useState(initialCity);
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'SOLD_OUT'>(
    initialAvailability
  );

  // Sync state if URL query changes (e.g. browser Back / Forward)
  useEffect(() => {
    const q = searchParams?.get('q') || '';
    const cat = searchParams?.get('category') || 'ALL';
    const city = searchParams?.get('city') || 'ALL';
    const avail = (searchParams?.get('availability') as 'ALL' | 'AVAILABLE' | 'SOLD_OUT') || 'ALL';

    setSearchQuery(q);
    setSelectedCategory(cat);
    setSelectedCity(city);
    setAvailabilityFilter(avail);
  }, [searchParams]);

  // F14: Update URL search params on user interaction without reload
  const updateUrlParams = (
    newQ: string,
    newCat: string,
    newCity: string,
    newAvail: 'ALL' | 'AVAILABLE' | 'SOLD_OUT'
  ) => {
    const params = new URLSearchParams();
    if (newQ.trim()) params.set('q', newQ.trim());
    if (newCat !== 'ALL') params.set('category', newCat);
    if (newCity !== 'ALL') params.set('city', newCity);
    if (newAvail !== 'ALL') params.set('availability', newAvail);

    const queryStr = params.toString();
    const targetUrl = queryStr ? `${pathname}?${queryStr}` : pathname;
    router.replace(targetUrl, { scroll: false });
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    updateUrlParams(val, selectedCategory, selectedCity, availabilityFilter);
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    updateUrlParams(searchQuery, cat, selectedCity, availabilityFilter);
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    updateUrlParams(searchQuery, selectedCategory, city, availabilityFilter);
  };

  const handleAvailabilityChange = (avail: 'ALL' | 'AVAILABLE' | 'SOLD_OUT') => {
    setAvailabilityFilter(avail);
    updateUrlParams(searchQuery, selectedCategory, selectedCity, avail);
  };

  // Spotlights the top featured event
  const featuredEvent = useMemo(() => {
    return events.find((e) => e.featured) || events[0];
  }, [events]);

  const featuredDateInfo = useMemo(() => {
    if (!featuredEvent) return null;
    return formatEventDateCard(featuredEvent.startsAt);
  }, [featuredEvent]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.city));
    return ['ALL', ...Array.from(set)];
  }, [events]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.category));
    return ['ALL', ...Array.from(set)];
  }, [events]);

  // Filter events according to search query and filters
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        event.title.toLowerCase().includes(q) ||
        event.venue.toLowerCase().includes(q) ||
        event.city.toLowerCase().includes(q) ||
        event.description.toLowerCase().includes(q);

      const matchCategory = selectedCategory === 'ALL' || event.category === selectedCategory;
      const matchCity = selectedCity === 'ALL' || event.city === selectedCity;

      const available = event.availableTickets;
      const matchAvailability =
        availabilityFilter === 'ALL' ||
        (availabilityFilter === 'AVAILABLE' && available > 0) ||
        (availabilityFilter === 'SOLD_OUT' && available <= 0);

      return matchQuery && matchCategory && matchCity && matchAvailability;
    });
  }, [events, searchQuery, selectedCategory, selectedCity, availabilityFilter]);

  // Sort upcoming events chronologically by startsAt
  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }, [filteredEvents]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('ALL');
    setSelectedCity('ALL');
    setAvailabilityFilter('ALL');
    router.replace(pathname, { scroll: false });
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    selectedCategory !== 'ALL' ||
    selectedCity !== 'ALL' ||
    availabilityFilter !== 'ALL';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px 64px 20px' }}>
      {/* Featured Spotlight Banner */}
      {featuredEvent && (
        <section
          style={{
            position: 'relative',
            borderRadius: 14,
            overflow: 'hidden',
            marginBottom: 32,
            minHeight: 340,
            display: 'flex',
            alignItems: 'flex-end',
            backgroundColor: '#18181b',
          }}
        >
          {/* Background Poster Image */}
          <img
            src={featuredEvent.poster}
            alt=''
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />

          {/* Natural Gradient Scrim */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(24, 24, 27, 0.1) 0%, rgba(24, 24, 27, 0.65) 60%, rgba(24, 24, 27, 0.95) 100%)',
            }}
          />

          {/* Banner Content */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              padding: '28px',
              maxWidth: 720,
              color: '#ffffff',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                backgroundColor: 'rgba(24, 24, 27, 0.8)',
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: '0.74rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                marginBottom: 10,
                color: '#f4f4f5',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                textTransform: 'uppercase',
              }}
            >
              <span>Sự kiện nổi bật</span>
            </div>

            <h1
              style={{
                fontSize: '1.85rem',
                fontWeight: 700,
                lineHeight: 1.25,
                marginBottom: 10,
                letterSpacing: '-0.02em',
                color: '#ffffff',
              }}
            >
              {featuredEvent.title}
            </h1>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontSize: '0.84rem',
                color: '#e4e4e7',
                marginBottom: 18,
                flexWrap: 'wrap',
              }}
            >
              {featuredDateInfo && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} color='#d4d4d8' />
                  <span>
                    {featuredDateInfo.fullDateVN} · {featuredDateInfo.timeStr}
                  </span>
                </span>
              )}
              <span>•</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} color='#d4d4d8' />
                <span>
                  {featuredEvent.venue}, {featuredEvent.city}
                </span>
              </span>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Link
                href={`/events/${featuredEvent.slug}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '10px 20px',
                  borderRadius: 8,
                  backgroundColor: '#ffffff',
                  color: '#18181b',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  textDecoration: 'none',
                }}
              >
                <span>Xem sự kiện</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Clean Neutral Search & Filter Controls */}
      <section style={{ marginBottom: 28 }}>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          {/* Search Input with Accessible Label */}
          <div
            style={{
              flex: '1 1 300px',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#ffffff',
              borderRadius: 8,
              padding: '0 12px',
              border: '1px solid #e4e4e7',
            }}
          >
            <label
              htmlFor='event-search-input'
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: 'hidden',
                clip: 'rect(0, 0, 0, 0)',
                border: 0,
              }}
            >
              Tìm kiếm sự kiện
            </label>
            <Search size={16} color='#71717a' style={{ marginRight: 8, flexShrink: 0 }} />
            <input
              id='event-search-input'
              type='text'
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder='Tìm sự kiện theo tên, địa điểm hoặc thành phố...'
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                padding: '10px 0',
                fontSize: '0.88rem',
                outline: 'none',
                width: '100%',
                color: '#18181b',
              }}
            />
            {searchQuery && (
              <button
                type='button'
                onClick={() => handleSearchChange('')}
                aria-label='Xóa tìm kiếm'
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#71717a',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* City Filter Buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {cities.map((city) => {
              const isSelected = selectedCity === city;
              return (
                <button
                  key={city}
                  type='button'
                  onClick={() => handleCityChange(city)}
                  aria-pressed={isSelected}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 600 : 500,
                    backgroundColor: isSelected ? '#18181b' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#52525b',
                    border: '1px solid',
                    borderColor: isSelected ? '#18181b' : '#e4e4e7',
                    cursor: 'pointer',
                  }}
                >
                  {city === 'ALL' ? 'Toàn quốc' : city}
                </button>
              );
            })}
          </div>

          {/* Ticket Status Filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'Tất cả vé' },
              { id: 'AVAILABLE', label: 'Còn vé' },
              { id: 'SOLD_OUT', label: 'Hết vé (Chờ)' },
            ].map((tab) => {
              const isSelected = availabilityFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type='button'
                  onClick={() =>
                    handleAvailabilityChange(tab.id as 'ALL' | 'AVAILABLE' | 'SOLD_OUT')
                  }
                  aria-pressed={isSelected}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 600 : 500,
                    backgroundColor: isSelected ? '#18181b' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#52525b',
                    border: '1px solid',
                    borderColor: isSelected ? '#18181b' : '#e4e4e7',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Filter Chips & Clear Action */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type='button'
                  onClick={() => handleCategoryChange(cat)}
                  aria-pressed={isSelected}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 999,
                    fontSize: '0.78rem',
                    fontWeight: isSelected ? 600 : 500,
                    backgroundColor: isSelected ? '#18181b' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#52525b',
                    border: '1px solid',
                    borderColor: isSelected ? '#18181b' : '#e4e4e7',
                    cursor: 'pointer',
                  }}
                >
                  {cat === 'ALL' ? 'Tất cả thể loại' : cat}
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <button
              type='button'
              onClick={clearFilters}
              style={{
                background: 'none',
                border: 'none',
                color: '#52525b',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
              }}
            >
              <X size={14} />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>
      </section>

      {/* Event Listing Grid */}
      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#18181b', margin: 0 }}>
            Sự kiện sắp diễn ra
          </h2>
          <span
            style={{ fontSize: '0.82rem', color: '#71717a', fontVariantNumeric: 'tabular-nums' }}
          >
            {loadState.status === 'success' ? `Hiển thị ${sortedEvents.length} sự kiện` : ''}
          </span>
        </div>

        {loadState.status === 'loading' ? (
          <div
            role='status'
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              padding: '60px 20px',
              textAlign: 'center',
              border: '1px solid #e4e4e7',
              color: '#71717a',
              fontSize: '0.9rem',
            }}
          >
            Đang tải danh sách sự kiện...
          </div>
        ) : loadState.status === 'error' ? (
          <div
            role='alert'
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              padding: '60px 20px',
              textAlign: 'center',
              border: '1px solid #e4e4e7',
            }}
          >
            <div
              style={{ fontSize: '1.05rem', fontWeight: 600, color: '#18181b', marginBottom: 6 }}
            >
              Không thể tải danh sách sự kiện
            </div>
            <p style={{ color: '#52525b', fontSize: '0.88rem', margin: '0 0 20px 0' }}>
              {loadState.message}
            </p>
            <button
              type='button'
              onClick={retryLoadEvents}
              style={{
                padding: '9px 18px',
                borderRadius: 6,
                backgroundColor: '#18181b',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Thử lại
            </button>
          </div>
        ) : events.length === 0 ? (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              padding: '60px 20px',
              textAlign: 'center',
              border: '1px solid #e4e4e7',
            }}
          >
            <div
              style={{ fontSize: '1.05rem', fontWeight: 600, color: '#18181b', marginBottom: 6 }}
            >
              Chưa có sự kiện nào
            </div>
            <p style={{ color: '#52525b', fontSize: '0.88rem', margin: 0 }}>
              Hiện chưa có sự kiện nào được mở bán. Vui lòng quay lại sau.
            </p>
          </div>
        ) : sortedEvents.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 24,
            }}
          >
            {sortedEvents.map((evt) => (
              <EventCard key={evt.id} event={evt} />
            ))}
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              padding: '60px 20px',
              textAlign: 'center',
              border: '1px solid #e4e4e7',
            }}
          >
            <div
              style={{ fontSize: '1.05rem', fontWeight: 600, color: '#18181b', marginBottom: 6 }}
            >
              Không tìm thấy sự kiện phù hợp
            </div>
            <p style={{ color: '#52525b', fontSize: '0.88rem', margin: '0 0 20px 0' }}>
              Hãy thử tìm kiếm từ khóa khác hoặc điều chỉnh lại các bộ lọc địa điểm/thể loại.
            </p>
            <button
              type='button'
              onClick={clearFilters}
              style={{
                padding: '9px 18px',
                borderRadius: 6,
                backgroundColor: '#18181b',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Xóa tất cả bộ lọc
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

const HomePage: React.FC = () => {
  return (
    <Suspense
      fallback={
        <div style={{ maxWidth: 1200, margin: '60px auto', textAlign: 'center', color: '#71717a' }}>
          Đang tải danh sách sự kiện...
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
};

export default HomePage;
