'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Event } from '@lib/mock/types';
import { formatVND, formatEventDateCard } from '@lib/utils/format';
import { useMockStore } from '@lib/mock/store';
import { MapPin, Calendar, ImageOff } from 'lucide-react';

interface EventCardProps {
  event: Event;
}

const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const { getAvailableTickets } = useMockStore();
  const available = getAvailableTickets(event);
  const isSoldOut = available <= 0;
  const isNearlySoldOut = available > 0 && available <= 5;
  const [imgError, setImgError] = useState(false);

  const { weekdayDate, timeStr } = formatEventDateCard(event.startsAt);

  return (
    <article
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #e4e4e7',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#a1a1aa';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e4e4e7';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <Link
        href={`/events/${event.slug}`}
        aria-label={`${event.title} - ${weekdayDate} lúc ${timeStr} tại ${event.venue}, ${event.city}`}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {/* Poster with 16:9 ratio and fallback (F26) */}
        <div
          style={{
            aspectRatio: '16 / 9',
            width: '100%',
            position: 'relative',
            backgroundColor: '#f4f4f5',
            overflow: 'hidden',
          }}
        >
          {!imgError ? (
            <img
              src={event.poster}
              alt=''
              loading='lazy'
              onError={() => setImgError(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#71717a',
                gap: 6,
                padding: 12,
                textAlign: 'center',
              }}
            >
              <ImageOff size={28} />
              <span style={{ fontSize: '0.78rem' }}>{event.category}</span>
            </div>
          )}

          {/* Ticket Status Badge */}
          {isSoldOut ? (
            <div
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: '0.72rem',
                fontWeight: 600,
                backgroundColor: 'rgba(24, 24, 27, 0.9)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                }}
              />
              <span>Hết vé</span>
            </div>
          ) : isNearlySoldOut ? (
            <div
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: '0.72rem',
                fontWeight: 600,
                backgroundColor: 'rgba(24, 24, 27, 0.9)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                }}
              />
              <span>Còn {available} vé</span>
            </div>
          ) : null}
        </div>

        {/* Card Body */}
        <div
          style={{
            padding: '16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: '0.74rem', color: '#52525b', fontWeight: 600, marginBottom: 4 }}>
            {event.category}
          </div>

          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#18181b',
              lineHeight: 1.35,
              margin: '0 0 10px 0',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: '2.7em',
            }}
          >
            {event.title}
          </h3>

          {/* Row 1: Date & Time */}
          <div
            style={{
              fontSize: '0.82rem',
              color: '#52525b',
              fontWeight: 500,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Calendar size={13} style={{ flexShrink: 0, color: '#71717a' }} />
            <span>
              {weekdayDate} · {timeStr}
            </span>
          </div>

          {/* Row 2: Venue and City */}
          <div
            style={{
              fontSize: '0.82rem',
              color: '#52525b',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            <MapPin size={13} style={{ flexShrink: 0, color: '#71717a' }} />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {event.venue}, {event.city}
            </span>
          </div>
        </div>

        {/* Card Footer */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontSize: '0.98rem',
              fontWeight: 700,
              color: '#18181b',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {event.priceVnd === 0 ? 'Miễn phí' : formatVND(event.priceVnd)}
          </div>

          <span
            style={{
              fontSize: '0.84rem',
              fontWeight: 600,
              color: '#18181b',
            }}
          >
            {isSoldOut ? 'Xem lượt chờ' : 'Xem sự kiện'}
          </span>
        </div>
      </Link>
    </article>
  );
};

export default EventCard;
