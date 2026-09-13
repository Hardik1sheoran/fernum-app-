import React from 'react'
import { clsx } from 'clsx'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
  variant?: 'default' | 'error' | 'warning'
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  variant = 'default',
}) => {
  const isError = variant === 'error'
  const isWarning = variant === 'warning'

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-xl',
        isError
          ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200'
          : isWarning
          ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#14171d]/60',
        className
      )}
    >
      <div
        className={clsx(
          'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-subtle',
          isError
            ? 'bg-rose-500/10 dark:bg-rose-500/20 text-rose-500'
            : isWarning
            ? 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-500'
            : 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-500'
        )}
      >
        {icon}
      </div>
      <h3
        className={clsx(
          'text-base font-semibold mb-1.5',
          isError
            ? 'text-rose-800 dark:text-rose-200'
            : isWarning
            ? 'text-amber-800 dark:text-amber-200'
            : 'text-slate-800 dark:text-slate-100'
        )}
      >
        {title}
      </h3>
      <p
        className={clsx(
          'text-xs max-w-sm mb-5 leading-relaxed',
          isError
            ? 'text-rose-600/90 dark:text-rose-300/80'
            : isWarning
            ? 'text-amber-600/90 dark:text-amber-300/80'
            : 'text-slate-500 dark:text-slate-400'
        )}
      >
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  )
}
