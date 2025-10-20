'use client'

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { AnimatePresence, motion } from 'framer-motion'
import { memo, useEffect, useState } from 'react'

type VerificationStep = {
  id: string
  label: string
  description: string
  status: 'pending' | 'loading' | 'success' | 'failed' | 'error'
}

type VerificationStatusDisplayProps = {
  isDarkMode: boolean
  onOpenVerifier: () => void
  verificationDocument?: {
    securityVerified?: boolean
    steps?: {
      [key: string]: {
        status: 'pending' | 'running' | 'success' | 'failed' | 'error'
        error?: string
      }
    }
  }
  isCompact?: boolean
}

export const VerificationStatusDisplay = memo(
  function VerificationStatusDisplay({
    isDarkMode,
    onOpenVerifier,
    verificationDocument,
    isCompact = false,
  }: VerificationStatusDisplayProps) {
    const [isAnimating, setIsAnimating] = useState(false)

    // Convert verification document to steps
    const steps: VerificationStep[] = []

    // Map verification document steps to display steps
    if (verificationDocument?.steps) {
      const stepMapping = {
        verifyEnclave: {
          label: 'Hardware Attestation',
          description: 'Verifying secure hardware enclave',
        },
        verifyCode: {
          label: 'Code Integrity',
          description: 'Verifying code integrity',
        },
        compareMeasurements: {
          label: 'Chat Security',
          description: 'Matching measurements',
        },
      }

      Object.entries(stepMapping).forEach(([stepId, config]) => {
        if (verificationDocument.steps?.[stepId]) {
          const step = verificationDocument.steps[stepId]
          steps.push({
            id: stepId,
            label: config.label,
            description: config.description,
            status:
              step.status === 'running'
                ? 'loading'
                : step.status === 'failed'
                  ? 'error'
                  : (step.status as VerificationStep['status']),
          })
        }
      })
    }

    // If no steps, show default pending state
    if (steps.length === 0) {
      steps.push(
        {
          id: 'verifyEnclave',
          label: 'Hardware Attestation',
          description: 'Verifying secure hardware enclave',
          status: 'pending',
        },
        {
          id: 'verifyCode',
          label: 'Code Integrity',
          description: 'Verifying code integrity',
          status: 'pending',
        },
        {
          id: 'compareMeasurements',
          label: 'Chat Security',
          description: 'Matching measurements',
          status: 'pending',
        },
      )
    }

    // Check overall status
    const isLoading = steps.some((step) => step.status === 'loading')
    const isComplete = verificationDocument?.securityVerified === true
    const hasError = verificationDocument?.securityVerified === false

    // Control animation based on loading state
    useEffect(() => {
      if (isLoading) {
        setIsAnimating(true)
      } else {
        setIsAnimating(false)
      }
    }, [isLoading])

    const getStepIcon = (status: VerificationStep['status']) => {
      switch (status) {
        case 'success':
          return <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
        case 'error':
          return (
            <div className="relative h-5 w-5 rounded-full bg-red-500">
              <svg
                className="absolute inset-0 h-5 w-5"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 6L14 14M14 6L6 14"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )
        case 'loading':
          return (
            <div
              className={`h-5 w-5 rounded-full border-2 ${
                isDarkMode ? 'border-gray-600' : 'border-gray-400'
              }`}
            />
          )
        default:
          return (
            <div
              className={`h-5 w-5 rounded-full border-2 ${
                isDarkMode ? 'border-gray-600' : 'border-gray-400'
              }`}
            />
          )
      }
    }

    // Compact mode for inline display
    if (isCompact) {
      return (
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <button
            onClick={onOpenVerifier}
            className={`group transition-opacity hover:opacity-100 ${
              isLoading ? 'opacity-100' : 'opacity-70'
            }`}
          >
            {/* Compact Header Only */}
            <div className="flex items-center gap-2">
              {hasError ? (
                <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
              ) : (
                <motion.div
                  animate={
                    isAnimating
                      ? {
                          rotate: [0, 5, -5, 0],
                        }
                      : {}
                  }
                  transition={{
                    duration: 2,
                    repeat: isAnimating ? Infinity : 0,
                    repeatDelay: 1,
                  }}
                >
                  <ShieldCheckIcon
                    className={`h-4 w-4 ${
                      isComplete
                        ? 'text-emerald-500'
                        : isDarkMode
                          ? 'text-gray-400'
                          : 'text-gray-500'
                    }`}
                  />
                </motion.div>
              )}
              <span
                className={`text-xs font-medium ${
                  isComplete
                    ? 'text-emerald-500'
                    : hasError
                      ? 'text-red-500'
                      : isDarkMode
                        ? 'text-gray-300'
                        : 'text-gray-600'
                }`}
              >
                {hasError
                  ? 'Security verification failed'
                  : isComplete
                    ? 'Security verification succeeded'
                    : isLoading
                      ? 'Verifying security...'
                      : 'Verify security →'}
              </span>
            </div>
          </button>
        </motion.div>
      )
    }

    // Full mode for standalone display
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.6 }}
      >
        <button
          onClick={onOpenVerifier}
          className={`group text-left transition-opacity hover:opacity-100 ${
            isLoading ? 'opacity-100' : 'opacity-70'
          }`}
        >
          {/* Header */}
          <div className="mb-1 flex items-center gap-2 md:mb-3">
            {hasError ? (
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
            ) : (
              <motion.div
                animate={
                  isAnimating
                    ? {
                        rotate: [0, 5, -5, 0],
                      }
                    : {}
                }
                transition={{
                  duration: 2,
                  repeat: isAnimating ? Infinity : 0,
                  repeatDelay: 1,
                }}
              >
                <ShieldCheckIcon
                  className={`h-5 w-5 ${
                    isComplete
                      ? 'text-emerald-500'
                      : isDarkMode
                        ? 'text-gray-400'
                        : 'text-gray-500'
                  }`}
                />
              </motion.div>
            )}
            <h3
              className={`text-xs font-medium ${
                isComplete
                  ? 'text-emerald-500'
                  : hasError
                    ? 'text-red-500'
                    : isDarkMode
                      ? 'text-gray-300'
                      : 'text-gray-600'
              }`}
            >
              {isComplete
                ? 'Verification complete'
                : hasError
                  ? 'Verification failed'
                  : isLoading
                    ? 'Verifying security...'
                    : 'Open verification center →'}
            </h3>
          </div>

          {/* Verification Steps - Inline - Hidden on mobile */}
          <div className="hidden flex-wrap gap-4 text-xs md:flex">
            <AnimatePresence mode="wait">
              {steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: index * 0.05,
                  }}
                  className="flex items-center gap-1.5"
                >
                  <span className="scale-75">{getStepIcon(step.status)}</span>
                  <span
                    className={`${
                      step.status === 'success'
                        ? 'text-emerald-500'
                        : step.status === 'error'
                          ? 'text-red-500'
                          : isDarkMode
                            ? 'text-gray-400'
                            : 'text-gray-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </button>
      </motion.div>
    )
  },
)
