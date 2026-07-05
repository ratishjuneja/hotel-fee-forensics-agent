/**
 * BellBoy brand mark — the navy reception bell under a gold audit magnifier.
 * This is the single source of truth for the logo inside the React tree; the
 * browser-tab favicon (`app/icon.svg`), the `favicon.ico` fallback, and the
 * apple / maskable PNGs are all rasterized from the same artwork, so the mark
 * reads identically in the tab, on the home screen, and in the header.
 *
 * The gradient ids are hard-coded (not `useId`) so this stays a Server
 * Component. Multiple instances on one page reuse the first-defined gradients —
 * same look, no client boundary.
 */
export function BellBoyMark({
  className,
  title = "BellBoy",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient
          id="bbTile"
          x1="32"
          y1="2"
          x2="32"
          y2="62"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#FCFBF7" />
          <stop offset="1" stopColor="#F1EBDC" />
        </linearGradient>
        <linearGradient
          id="bbBell"
          x1="18"
          y1="17"
          x2="46"
          y2="45"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2A4A8C" />
          <stop offset="0.55" stopColor="#1B3468" />
          <stop offset="1" stopColor="#122A54" />
        </linearGradient>
        <linearGradient
          id="bbGold"
          x1="20"
          y1="18"
          x2="50"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#EBCB5C" />
          <stop offset="0.5" stopColor="#CBA334" />
          <stop offset="1" stopColor="#A9821F" />
        </linearGradient>
        <linearGradient
          id="bbPaper"
          x1="27"
          y1="24"
          x2="41"
          y2="43"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#FBF7EC" />
          <stop offset="1" stopColor="#E9E0C8" />
        </linearGradient>
      </defs>

      {/* tile */}
      <rect x="1" y="1" width="62" height="62" rx="14" fill="url(#bbTile)" />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="13.5"
        fill="none"
        stroke="#16294C"
        strokeOpacity="0.10"
      />

      {/* bell button */}
      <rect x="30.3" y="11.5" width="3.4" height="7" rx="1.7" fill="url(#bbGold)" />
      <ellipse cx="32" cy="11.2" rx="4.4" ry="2.5" fill="url(#bbGold)" />

      {/* bell dome + base */}
      <path
        d="M14 45 C14 29 21.6 19.5 32 19.5 C42.4 19.5 50 29 50 45 Z"
        fill="url(#bbBell)"
      />
      <rect x="11" y="44.5" width="42" height="6.4" rx="3.2" fill="url(#bbBell)" />
      <rect x="11" y="49.4" width="42" height="1.7" rx="0.85" fill="url(#bbGold)" />
      <path
        d="M20 27 C23 22.5 27.5 21 30.5 21.5 C26.5 22.5 23 26 21.5 31 Z"
        fill="#FFFFFF"
        fillOpacity="0.16"
      />

      {/* magnifier handle */}
      <line
        x1="43"
        y1="42"
        x2="52"
        y2="51"
        stroke="url(#bbGold)"
        strokeWidth="5.4"
        strokeLinecap="round"
      />

      {/* lens document: check + bars */}
      <circle cx="33.5" cy="32.5" r="10.5" fill="url(#bbPaper)" />
      <path
        d="M40 30.5 L36.6 34.2 L34.7 32.2"
        fill="none"
        stroke="url(#bbGold)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="29" y="35.6" width="3" height="4.4" rx="1" fill="#1B3468" />
      <rect x="33" y="33.4" width="3" height="6.6" rx="1" fill="#1B3468" />

      {/* magnifier ring */}
      <circle
        cx="33.5"
        cy="32.5"
        r="12.7"
        fill="none"
        stroke="url(#bbGold)"
        strokeWidth="4.2"
      />
    </svg>
  );
}
