'use client'

import { useUser } from '@clerk/nextjs'
import Avatar from 'boring-avatars'

const AVATAR_COLORS = ['#061820', '#004444', '#68C7AC', '#F0F4F4', '#F9F8F6']

type UserAvatarProps = {
  size?: number
  className?: string
}

export function UserAvatar({ size = 32, className }: UserAvatarProps) {
  const { user } = useUser()

  if (!user) return null

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id
  const initials = (
    user.firstName?.[0] ||
    user.lastName?.[0] ||
    ''
  ).toUpperCase()
  const fontSize = size * 0.4

  if (user.hasImage) {
    return (
      <img
        src={user.imageUrl}
        alt={displayName}
        width={size}
        height={size}
        className={className}
        style={{ borderRadius: '50%' }}
      />
    )
  }

  return (
    <div
      className={className}
      style={{ position: 'relative', width: size, height: size }}
    >
      <Avatar
        size={size}
        name={user.id}
        variant="pixel"
        colors={AVATAR_COLORS}
      />
      {initials && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize,
            fontWeight: 800,
            color: 'white',
            textShadow:
              '0 1px 3px rgba(0, 0, 0, 0.8), 0 0 6px rgba(0, 0, 0, 0.4)',
            letterSpacing: '0.02em',
            pointerEvents: 'none',
          }}
        >
          {initials}
        </span>
      )}
    </div>
  )
}
