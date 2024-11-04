import { createStyles } from "./4_utils/helpers";
import { WebimatorConnectorElement } from "./3_components/WebimatorConnectorElement";
import { WebimatorPlaybackButtonElement } from "./3_components/WebimatorPlaybackButtonElement";

export function injectGlobals() {
  WebimatorConnectorElement.addToCustomElementRegistry();
  WebimatorPlaybackButtonElement.addToCustomElementRegistry();

  // opacity of connector markers
  if (window.CSS.registerProperty) {
    window.CSS.registerProperty({
      name: "--b-marker-opacity",
      syntax: "<number>",
      inherits: true,
      initialValue: '1',
    });
  
    window.CSS.registerProperty({
      name: "--a-marker-opacity",
      syntax: "<number>",
      inherits: true,
      initialValue: '1',
    });
  }
  
  createStyles(/*css*/`
    /* Using :where makes it possible for developer to easily override the default color */
    :where(:root) {
      --wbmtr-highlight-color: #F9F278;
      --wbmtr-playback-button-press-color: #db0000;
      --wbmtr-playback-button-hold-color: #62B720;
      --wbmtr-playback-button-disabled-color: gray;
      --wbmtr-playback-button-background-color: #444;
      --wbmtr-playback-button-symbol-color: white;
    }
    
    .wbmtr-display-none:not(.wbmtr-force-show) {
      display: none !important;
    }
    
    .wbmtr-visibility-hidden:not(.wbmtr-force-show) {
      visibility: hidden !important;
    }
    
    .wbmtr-highlightable {
      background-image: linear-gradient(to right, var(--wbmtr-highlight-color) 50%, transparent 50%);
      background-size: 202%;
      background-position-x: 100%;
    }`
  );
}
