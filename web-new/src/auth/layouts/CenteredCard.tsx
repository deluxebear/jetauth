import type { ReactNode } from "react";
import BackgroundLayer from "../shell/BackgroundLayer";

interface Props {
  children: ReactNode;
  backgroundUrl?: string;
  backgroundUrlMobile?: string;
}

/**
 * formOffset=2 (or 0): full-screen background image + centered content
 * card. Mobile degrades to the same layout (background stays).
 */
export default function CenteredCard({ children, backgroundUrl, backgroundUrlMobile }: Props) {
  return (
    <BackgroundLayer url={backgroundUrl} urlMobile={backgroundUrlMobile}>
      {children}
    </BackgroundLayer>
  );
}
