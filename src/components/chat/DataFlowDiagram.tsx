import { memo, useEffect, useRef, useState } from 'react'
import { BiSolidLock } from 'react-icons/bi'
import { HiOutlineServer } from 'react-icons/hi'
import { HiOutlineKey, HiShieldCheck } from 'react-icons/hi2'

const ARROW_COLOR = 'hsl(var(--content-muted) / 0.7)'

const DESIGN_W = 520
const DESIGN_H = 340

function Arrow({ d }: { d: string }) {
  return (
    <path
      d={d}
      stroke={ARROW_COLOR}
      strokeWidth="1.5"
      strokeDasharray="4 5"
      strokeLinecap="round"
      className="df-animated-arrow"
      markerEnd="url(#df-arrow)"
    />
  )
}

/**
 * Simplified data-flow diagram showing how data flows between the
 * Tinfoil Chat App, Tinfoil Server, and Inference Processing enclave.
 *
 * Four arrows:
 *   1. Enclave top  -> Verification Proof pill (proof sent up)
 *   2. Pill left    -> App top                 (proof delivered to app)
 *   3. App right    -> Enclave left            (encrypted request)
 *   4. Enclave left -> App right               (encrypted response)
 *
 * All coordinates target a fixed 520x340 canvas. The diagram scales
 * down proportionally on smaller screens via ResizeObserver.
 */
export const DataFlowDiagram = memo(function DataFlowDiagram() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? DESIGN_W
      setScale(Math.min(width / DESIGN_W, 1))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // SVG arrow connection points
  const pillLeft = { x: 150, y: 10 }
  const pillRight = { x: 310, y: 10 }

  const appTop = { x: 65, y: 187 }
  const appRightUpper = { x: 130, y: 205 }
  const appRightLower = { x: 130, y: 230 }

  const enclaveTopRight = { x: 430, y: 185 }
  const enclaveLeftUpper = { x: 280, y: 205 }
  const enclaveLeftLower = { x: 280, y: 230 }

  return (
    <div
      ref={containerRef}
      className="relative mt-5 w-full select-none overflow-hidden"
      style={{ height: DESIGN_H * scale }}
    >
      <style>{`
        @keyframes df-dash {
          to { stroke-dashoffset: -18; }
        }
        .df-animated-arrow {
          animation: df-dash 1.2s linear infinite;
        }
      `}</style>

      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${scale})`,
        }}
      >
        <svg
          viewBox={`0 0 ${DESIGN_W} ${DESIGN_H}`}
          fill="none"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <marker
              id="df-arrow"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill={ARROW_COLOR} />
            </marker>
          </defs>

          {/* Enclave top -> pill right */}
          <Arrow
            d={`M ${enclaveTopRight.x} ${enclaveTopRight.y} C 500 85, 395 30, ${pillRight.x} ${pillRight.y + 14}`}
          />

          {/* Pill left -> app top */}
          <Arrow
            d={`M ${pillLeft.x} ${pillLeft.y + 14} C 80 30, 60 120, ${appTop.x} ${appTop.y}`}
          />

          {/* App -> enclave (request) */}
          <Arrow
            d={`M ${appRightUpper.x} ${appRightUpper.y} L ${enclaveLeftUpper.x} ${enclaveLeftUpper.y}`}
          />

          {/* Enclave -> app (response) */}
          <Arrow
            d={`M ${enclaveLeftLower.x} ${enclaveLeftLower.y} L ${appRightLower.x} ${appRightLower.y}`}
          />
        </svg>

        {/* Verification Proof pill */}
        <div
          className="absolute top-[8px]"
          style={{ left: 'calc(50% - 30px)', transform: 'translateX(-50%)' }}
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap rounded border border-brand-accent-light/40 bg-brand-accent-light/10 px-3 py-1.5 text-base font-medium text-brand-accent-dark dark:border-brand-accent-light/30 dark:bg-brand-accent-light/10 dark:text-brand-accent-light">
            <HiShieldCheck className="h-4 w-4" />
            <span>Verification Proof</span>
          </div>
        </div>

        {/* Tinfoil Server container */}
        <div
          className="absolute rounded border border-border-subtle bg-surface-card/50 px-5 pb-5 pt-3 dark:bg-surface-card/30"
          style={{
            left: 236,
            top: 72,
            width: 284,
            height: 208,
          }}
        >
          <div className="flex items-center gap-2">
            <HiOutlineServer className="h-4 w-4 text-content-muted" />
            <span className="text-base font-medium text-content-primary">
              Tinfoil Server
            </span>
          </div>
          <ul className="mt-1 list-disc pl-4 text-sm text-content-muted">
            <li>Does not see user data</li>
            <li>Cannot access enclave</li>
            <li>Does not have decryption key</li>
          </ul>
        </div>

        {/* Inference Processing (enclave) */}
        <div
          className="absolute rounded border border-brand-accent-light/40 bg-white px-4 py-3 shadow-sm dark:border-brand-accent-light/30 dark:bg-surface-card"
          style={{
            width: 224,
            left: 280,
            top: 185,
          }}
        >
          <div className="flex items-center gap-2">
            <BiSolidLock className="h-3.5 w-3.5 text-brand-accent-dark dark:text-brand-accent-light" />
            <span className="text-base font-medium text-content-primary">
              Inference Processing
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-content-muted">
            Data processed in secure hardware, isolated from the server.
          </p>
        </div>

        {/* Tinfoil Chat App */}
        <div
          className="absolute rounded border border-brand-accent-light/40 bg-white px-4 py-3 shadow-sm dark:border-brand-accent-light/30 dark:bg-surface-card"
          style={{ left: 0, top: 190, width: 155 }}
        >
          <div className="flex items-center gap-2">
            <HiOutlineKey className="h-4 w-4 text-content-muted" />
            <span className="text-base font-medium text-content-primary">
              Tinfoil Chat App
            </span>
          </div>
          <ul className="mt-1 list-disc pl-4 text-sm text-content-muted">
            <li>Sees user data</li>
            <li>Has decryption key</li>
            <li>Checks proof</li>
          </ul>
        </div>
      </div>
    </div>
  )
})
