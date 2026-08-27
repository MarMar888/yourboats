import { ImageResponse } from 'next/og'

export const alt = 'Yourboats — Marina Operations Software'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PRIMARY = 'hsl(201, 100%, 36%)'
const FOREGROUND = 'hsl(222.2, 84%, 4.9%)'
const MUTED = 'hsl(215, 16%, 47%)'
const BORDER = 'hsl(214.3, 31.8%, 91.4%)'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#fff',
          padding: 80,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '9999px',
              backgroundColor: PRIMARY,
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 36, fontWeight: 600, color: FOREGROUND, letterSpacing: -0.5 }}>
            Yourboats
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 22,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: PRIMARY,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '9999px',
                backgroundColor: PRIMARY,
                display: 'flex',
              }}
            />
            Marina Operations Software
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 60,
              fontWeight: 600,
              color: FOREGROUND,
              letterSpacing: -1.5,
              lineHeight: 1.1,
              maxWidth: 980,
            }}
          >
            The Operating System for Marinas + Boat Detailers
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: MUTED, maxWidth: 820 }}>
            Slip management, scheduling, invoicing, payroll, and an AI
            assistant.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 32,
            fontSize: 22,
            color: MUTED,
          }}
        >
          yourboats.squeakycleanboats.com
        </div>
      </div>
    ),
    { ...size }
  )
}
