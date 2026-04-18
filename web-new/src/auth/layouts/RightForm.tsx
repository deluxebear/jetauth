import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  backgroundUrl?: string;
  backgroundUrlMobile?: string;
}

export default function RightForm({ children, backgroundUrl }: Props) {
  return (
    <div className="min-h-screen flex">
      <div
        className="hidden lg:block flex-1 relative"
        style={
          backgroundUrl
            ? {
                backgroundImage: `url(${backgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {
                backgroundImage:
                  "linear-gradient(135deg, var(--surface-1, #f8fafc) 0%, var(--surface-2, #f0f4f8) 100%)",
              }
        }
      >
        <div className="absolute inset-0 bg-gradient-to-tl from-black/20 via-transparent to-transparent" />
      </div>
      <div className="w-full lg:w-[420px] lg:flex-shrink-0 bg-surface-0 relative z-10">
        {children}
      </div>
    </div>
  );
}
