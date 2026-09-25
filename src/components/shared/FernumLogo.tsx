import React from 'react'

interface FernumLogoProps {
  className?: string
  variant?: 'cyan' | 'white' | 'icon'
  glow?: boolean
}

export const FernumLogo: React.FC<FernumLogoProps> = ({
  className = 'w-5 h-5',
  variant = 'cyan',
  glow = false,
}) => {
  const src =
    variant === 'icon'
      ? '/icon.png'
      : variant === 'white'
      ? '/logo-white.png'
      : '/logo-cyan.png'

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      {glow && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain filter blur-xs opacity-75 transform scale-110 pointer-events-none"
        />
      )}
      <img
        src={src}
        alt="Fernum Logo"
        className="relative w-full h-full object-contain select-none"
        draggable={false}
      />
    </div>
  )
}
