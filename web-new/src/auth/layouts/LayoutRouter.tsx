import type { ReactNode } from "react";
import type { AuthApplication } from "../api/types";
import CenteredCard from "./CenteredCard";
import LeftForm from "./LeftForm";
import RightForm from "./RightForm";
import SidePanel from "./SidePanel";

interface LayoutRouterProps {
  application: AuthApplication;
  children: ReactNode;
}

/**
 * Dispatches to the right layout wrapper based on
 * application.formOffset (1=Left, 2=Center, 3=Right, 4=SidePanel).
 * Unknown or zero values default to CenteredCard.
 */
export default function LayoutRouter({ application, children }: LayoutRouterProps) {
  const offset = application.formOffset ?? 0;
  const bg = application.formBackgroundUrl || undefined;
  const bgMobile = application.formBackgroundUrlMobile || undefined;

  switch (offset) {
    case 1:
      return <LeftForm backgroundUrl={bg} backgroundUrlMobile={bgMobile}>{children}</LeftForm>;
    case 3:
      return <RightForm backgroundUrl={bg} backgroundUrlMobile={bgMobile}>{children}</RightForm>;
    case 4:
      return <SidePanel sideHtml={application.formSideHtml}>{children}</SidePanel>;
    case 2:
    case 0:
    default:
      return <CenteredCard backgroundUrl={bg} backgroundUrlMobile={bgMobile}>{children}</CenteredCard>;
  }
}
