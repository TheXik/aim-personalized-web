// Aim's logo mark, from Aim's own site (design/aim-reference/assets/aim-mark.svg).
// The outer arcs turn once every 10 s, off under reduced motion (aim-tokens.css).

export function AimMark({ size = 22, spin = true, className }: { size?: number; spin?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M10 8.34863C10.9121 8.34863 11.6521 9.08793 11.6523 10C11.6521 10.9121 10.9121 11.6523 10 11.6523C9.08806 11.6521 8.34886 10.9119 8.34863 10C8.34886 9.08806 9.08806 8.34886 10 8.34863Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.99902 4.41992C13.0809 4.41992 15.5799 6.91818 15.5801 10C15.5799 13.0818 13.0809 15.5811 9.99902 15.5811C6.9173 15.5809 4.4191 13.0817 4.41895 10C4.4191 6.91828 6.9173 4.42007 9.99902 4.41992ZM9.99902 6.29492C7.95284 6.29507 6.2941 7.95381 6.29395 10C6.2941 12.0462 7.95284 13.7059 9.99902 13.7061C12.0453 13.7061 13.7049 12.0463 13.7051 10C13.7049 7.95372 12.0453 6.29492 9.99902 6.29492Z"
        fill="currentColor"
      />
      <g className={spin ? "aim-mark-spin" : undefined}>
        <path
          d="M 17.714 10 C 17.714 14.261 14.26 17.714 9.999 17.714 M 2.285 10 C 2.285 5.74 5.739 2.286 9.999 2.286"
          stroke="currentColor"
          strokeWidth="1.69"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  )
}
