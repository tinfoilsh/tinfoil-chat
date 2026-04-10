'use client'

import Lottie from 'lottie-react'

import animationData from './logo-loading-loop.json'

export function LogoLoading({ size = 80 }: { size?: number }) {
  return (
    <Lottie
      animationData={animationData}
      loop
      autoplay
      style={{ width: size, height: size }}
    />
  )
}
