export function MemoryLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <line
          x1="12"
          y1="4"
          x2="4"
          y2="18"
          stroke="#7c6fd6"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <line
          x1="12"
          y1="4"
          x2="20"
          y2="18"
          stroke="#7c6fd6"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <line
          x1="4"
          y1="18"
          x2="20"
          y2="18"
          stroke="#7c6fd6"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="12" cy="4" r="2.5" fill="#c4b5fd" />
        <circle cx="4" cy="18" r="2.5" fill="#c4b5fd" />
        <circle cx="20" cy="18" r="2.5" fill="#c4b5fd" />
      </svg>
      <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
        membank
      </span>
    </div>
  );
}
