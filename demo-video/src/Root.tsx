import React from "react";
import { Composition } from "remotion";
import { PossibLawArchitecture } from "./Video";
import { OrchestrationDemo } from "./Demo";
import { OrchestrationPromo, promoDuration } from "./Promo";

export const Root: React.FC = () => (
  <>
  <Composition
    id="PossibLawArchitecture"
    component={PossibLawArchitecture}
    durationInFrames={3270}
    fps={30}
    width={1920}
    height={1080}
  />
    <Composition id="OrchestrationPromo" component={OrchestrationPromo} durationInFrames={promoDuration} fps={30} width={1920} height={1080} />
    <Composition id="OrchestrationDemo" component={OrchestrationDemo} durationInFrames={2400} fps={30} width={1920} height={1080} />
  </>
);
