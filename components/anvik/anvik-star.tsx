type StarSize = "sm" | "md" | "lg";

const SIZE_MAP: Record<StarSize, { svg: number; className: string }> = {
  sm: { svg: 14, className: "h-3.5 w-3.5" },
  md: { svg: 20, className: "h-5 w-5" },
  lg: { svg: 28, className: "h-7 w-7" },
};

export default function AnvikStar({
  size = "md",
  className = "",
  spin = false,
}: {
  size?: StarSize;
  className?: string;
  spin?: boolean;
}) {
  const s = SIZE_MAP[size];
  return (
    <svg
      width={s.svg}
      height={s.svg}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`anvik-star ${s.className} ${className}`}
      style={spin ? { animation: "star-spin 1s cubic-bezier(0.4,0,0.2,1)" } : undefined}
      aria-hidden="true"
    >
      <path
        d="M12 2.5L13.8 9.2L20.5 11L13.8 12.8L12 19.5L10.2 12.8L3.5 11L10.2 9.2L12 2.5Z"
        fill="#D97757"
      />
      <circle cx="12" cy="11" r="1.5" fill="#FFFFFF" />
    </svg>
  );
}
