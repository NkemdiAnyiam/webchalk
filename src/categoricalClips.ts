import { AnimClip, AnimClipConfig } from "./AnimClip";
import { EffectOptions, EffectGenerator, EffectGeneratorBank } from "./WebFlik";
import { CustomErrors, errorTip } from "./utils/errors";
import { parseMultiUnitPlacement } from "./utils/helpers";
import { ParsedMultiUnitPlacement, MultiUnitPlacementX, MultiUnitPlacementY } from "./utils/interfaces";
import { WbfkConnector, WbfkConnectorConfig } from "./WbfkConnector";

/*****************************************************************************************************************************/
/*********************************************        ENTRANCE        ********************************************************/
/*****************************************************************************************************************************/
export type EntranceClipConfig = AnimClipConfig & {
  hideNowType: 'display-none' | 'visibility-hidden' | null;
};
export class EntranceClip<TEffectGenerator extends EffectGenerator<EntranceClip, EntranceClipConfig> = EffectGenerator> extends AnimClip<TEffectGenerator> {
  get category(): 'Entrance' { return 'Entrance'; }
  private backwardsHidingMethod: ExitClipConfig['exitType'] = '' as ExitClipConfig['exitType'];

  protected get defaultConfig(): Partial<EntranceClipConfig> {
    return {
      commitsStyles: false,
      runGeneratorsNow: true,
      hideNowType: null,
    };
  }

  constructor(domElem: Element | null | undefined, effectName: string, effectGeneratorBank: EffectGeneratorBank) {
    super(domElem, effectName, effectGeneratorBank);
    super.preventConnector();
  }

  /**@internal*/initialize(effectOptions: EffectOptions<TEffectGenerator>, effectConfig: Partial<EntranceClipConfig> = {}) {
    super.initialize(effectOptions, effectConfig);

    const hideNow = effectConfig.hideNowType ?? this.effectGenerator.config?.hideNowType ?? this.defaultConfig.hideNowType!;
    switch(hideNow) {
      case "display-none":
        this.domElem.classList.add('wbfk-hidden');
        break;
      case "visibility-hidden":
        this.domElem.classList.add('wbfk-invisible');
        break;
      default:
        break;
    }

    return this;
  }

  protected _onStartForward(): void {
    if (this.domElem.classList.contains('wbfk-hidden')) {
      this.backwardsHidingMethod = 'display-none';
      this.domElem.classList.remove('wbfk-hidden');
    }
    else if (this.domElem.classList.contains('wbfk-invisible')) {
      this.backwardsHidingMethod = 'visibility-hidden';
      this.domElem.classList.remove('wbfk-invisible');
    }
    else {
      const { display, visibility } = getComputedStyle(this.domElem);
      let str = ``;
      if (display === 'none') {
        str = `The element being entered is hidden with CSS 'display: none', but it was not using the class "wbfk-hidden".` +
        ` An element needs to be unrendered using the class "wbfk-hidden" in order for Entrance() to act on it.`;
      }
      else if (visibility === 'hidden') {
        str = `The element being entered is hidden with CSS 'visibility: hidden', but it was not using the class "wbfk-invisible".` +
        ` An element needs to be unrendered using the class "wbfk-invisible" in order for Entrance() to act on it.`;
      }
      else {
        str = `Entrance() can only act on elements that are already hidden, but this element was not hidden.` +
        ` To hide an element, you can 1) use the 'hideNowType' config option to immediately hide the element from the very start,` +
        ` 2) hide it with Exit() before the Entrance() animation runs, or` +
        ` 3) manually add either "wbfk-hidden" or "wbfk-invisible" to its CSS class list in the HTML.`;
      }
      throw this.generateError(CustomErrors.InvalidEntranceAttempt,
        str +
        `${errorTip(
          `Tip: Adding "wbfk-hidden" to an element's CSS class list applies a 'display: none' CSS style, which completely unrenders an element.` +
          ` "wbfk-invisible" applies a 'visibility: hidden' CSS style, which just makes the element invisible while still taking up space.` +
          ` When using 'exitType' with Exit() or 'hideNowType' with Entrance(), you may set the config options to "display-none" (the default for exitType)` +
          ` or "visibility-hidden", but behind the scenes, this just determines whether to add` +
          ` the class "wbfk-hidden" or the class "wbfk-invisible".`
        )}`
      );
    }
  }

  protected _onFinishBackward(): void {
    switch(this.backwardsHidingMethod) {
      case "display-none": this.domElem.classList.add('wbfk-hidden'); break;
      case "visibility-hidden": this.domElem.classList.add('wbfk-invisible'); break;
      default: throw this.generateError(Error, `This error should NEVER be reached.`);
    }
  }
}


/*****************************************************************************************************************************/
/***********************************************        EXIT        **********************************************************/
/*****************************************************************************************************************************/
export type ExitClipConfig = AnimClipConfig & {
  exitType: 'display-none' | 'visibility-hidden';
};
// TODO: prevent already hidden clips from being allowed to use exit animation
export class ExitClip<TEffectGenerator extends EffectGenerator<ExitClip, ExitClipConfig> = EffectGenerator> extends AnimClip<TEffectGenerator> {
  get category(): 'Exit' { return 'Exit'; }
  private exitType: ExitClipConfig['exitType'] = '' as ExitClipConfig['exitType'];

  protected get defaultConfig(): Partial<ExitClipConfig> {
    return {
      commitsStyles: false,
      runGeneratorsNow: true,
      exitType: 'display-none',
    };
  }

  constructor(domElem: Element | null | undefined, effectName: string, effectGeneratorBank: EffectGeneratorBank) {
    super(domElem, effectName, effectGeneratorBank);
    super.preventConnector();
  }

  /**@internal*/initialize(effectOptions: EffectOptions<TEffectGenerator>, effectConfig: Partial<ExitClipConfig> = {}) {
    super.initialize(effectOptions, effectConfig);

    const exitType = effectConfig.exitType ?? this.effectGenerator.config?.exitType ?? this.defaultConfig.exitType!;
    if (exitType !== 'display-none' && exitType !== 'visibility-hidden') {
      throw this.generateError(RangeError, `Invalid 'exitType' config value "${exitType}". Must be "display-none" or "visibility-hidden".`);
    }
    this.exitType = exitType;

    return this;
  }

  protected _onFinishForward(): void {
    switch(this.exitType) {
      case "display-none": this.domElem.classList.add('wbfk-hidden'); break;
      case "visibility-hidden": this.domElem.classList.add('wbfk-invisible'); break;
    }
  }

  protected _onStartBackward(): void {
    switch(this.exitType) {
      case "display-none": this.domElem.classList.remove('wbfk-hidden'); break;
      case "visibility-hidden": this.domElem.classList.remove('wbfk-invisible'); break;
    }
  }
}

/*****************************************************************************************************************************/
/*********************************************        EMPHASIS        ********************************************************/
/*****************************************************************************************************************************/
export type EmphasisClipConfig = AnimClipConfig & {
  
};
export class EmphasisClip<TEffectGenerator extends EffectGenerator = EffectGenerator> extends AnimClip<TEffectGenerator> {
  public get category(): 'Emphasis' { return 'Emphasis'; }
  protected get defaultConfig(): Partial<EmphasisClipConfig> {
    return {};
  }
}

/*****************************************************************************************************************************/
/**********************************************        MOTION        *********************************************************/
/*****************************************************************************************************************************/
export type MotionClipConfig = AnimClipConfig & {
  
};
export class MotionClip<TEffectGenerator extends EffectGenerator = EffectGenerator> extends AnimClip<TEffectGenerator> {
  public get category(): 'Motion' { return 'Motion'; }
  protected get defaultConfig(): Partial<MotionClipConfig> {
    return {
      composite: 'accumulate',
    };
  }
}

/*****************************************************************************************************************************/
/*********************************************        SCROLLER        ********************************************************/
/*****************************************************************************************************************************/
export type ScrollerClipConfig = AnimClipConfig & {
  
};
// TODO: implement rewindScrollBehavior: 'prior-user-position' | 'prior-scroll-target' = 'prior-scroll-target'
export class ScrollerClip<TEffectGenerator extends EffectGenerator = EffectGenerator> extends AnimClip<TEffectGenerator> {
  public get category(): 'Scroller' { return 'Scroller'; }
  protected get defaultConfig(): Partial<ScrollerClipConfig> {
    return {
      commitsStyles: false,
    };
  }
}

/*****************************************************************************************************************************/
/********************************************        TRANSITION        *******************************************************/
/*****************************************************************************************************************************/
export type TransitionClipConfig = AnimClipConfig & {
  removeInlineStylesOnFinish: boolean;
}
export class TransitionClip<TEffectGenerator extends EffectGenerator<TransitionClip, TransitionClipConfig> = EffectGenerator> extends AnimClip<TEffectGenerator> {
  public get category(): 'Transition' { return 'Transition'; }
  // determines whether properties affected by this transition should be removed from inline style upon finishing animation
  private removeInlineStyleOnFinish: boolean = false;

  protected get defaultConfig(): Partial<TransitionClipConfig> {
    return {};
  }

  /**@internal*/initialize(effectOptions: EffectOptions<TEffectGenerator>, effectConfig: Partial<TransitionClipConfig> = {}) {
    super.initialize(effectOptions, effectConfig);
    this.removeInlineStyleOnFinish = effectConfig.removeInlineStylesOnFinish ?? this.effectGenerator.config?.removeInlineStylesOnFinish ?? this.defaultConfig.removeInlineStylesOnFinish!;
    return this;
  }

  protected _onFinishForward(): void {
    if (this.removeInlineStyleOnFinish) {
      const keyframe = this.effectOptions[0] as Keyframe;
      for (const property in keyframe) {
        (this.domElem as HTMLElement).style[property as any] = "";
      }
    }
  }
}

/*****************************************************************************************************************************/
/*****************************************        CONNECTOR SETTER        ****************************************************/
/*****************************************************************************************************************************/
export type ConnectorSetterClipConfig = AnimClipConfig & {
  
};
export class ConnectorSetterClip extends AnimClip {
  public get category(): 'Connector Setter' { return 'Connector Setter'; }
  domElem: WbfkConnector;
  previousPointA?: [elemA: Element, xPlacement: ParsedMultiUnitPlacement, yPlacement: ParsedMultiUnitPlacement];
  previousPointB?: [elemB: Element, xPlacement: ParsedMultiUnitPlacement, yPlacement: ParsedMultiUnitPlacement];
  pointA: [elemA: Element, xPlacement: ParsedMultiUnitPlacement, yPlacement: ParsedMultiUnitPlacement] | 'use-preserved';
  pointB: [elemB: Element, xPlacement: ParsedMultiUnitPlacement, yPlacement: ParsedMultiUnitPlacement] | 'use-preserved';

  connectorConfig: WbfkConnectorConfig = {} as WbfkConnectorConfig;
  previousConnectorConfig: WbfkConnectorConfig = {} as WbfkConnectorConfig;
  protected get defaultConfig(): Partial<ConnectorSetterClipConfig> {
    return {
      duration: 0,
      commitsStyles: false,
      runGeneratorsNow: true,
      startsNextClipToo: true,
    };
  }
  
  constructor(
    connectorElem: WbfkConnector | null | undefined,
    pointA: [elemA: Element | null | undefined, xPlacement: number | MultiUnitPlacementX, yPlacement: number | MultiUnitPlacementY] | ['preserve'],
    pointB: [elemB: Element | null | undefined, xPlacement: number | MultiUnitPlacementX, yPlacement: number | MultiUnitPlacementY] | ['preserve'],
    effectName: string,
    effectGeneratorBank: EffectGeneratorBank,
    connectorConfig: Partial<WbfkConnectorConfig> = {},
    ) {
    super(connectorElem, effectName, effectGeneratorBank);

    if (!(connectorElem instanceof WbfkConnector)) { throw this.generateError(CustomErrors.InvalidElementError, `Must pass ${WbfkConnector.name} element.`); }

    const pointAElement = pointA[0] === 'preserve' ? connectorElem!.pointA?.[0] : pointA?.[0];
    if (!(pointAElement instanceof Element)) {
      throw this.generateError(CustomErrors.InvalidElementError, `Point A element must not be null or undefined.`);
    }
    const pointBElement = pointB[0] === 'preserve' ? connectorElem?.pointB?.[0] : pointB?.[0];
    if (!(pointBElement instanceof Element)) {
      throw this.generateError(CustomErrors.InvalidElementError, `Point B element must not be null or undefined.`);
    }

    this.domElem = connectorElem;
    this.pointA = pointA[0] === 'preserve' ? 'use-preserved' : [pointAElement, parseMultiUnitPlacement(pointA[1], 'horizontal'), parseMultiUnitPlacement(pointA[2], 'vertical')];
    this.pointB = pointB[0] === 'preserve' ? 'use-preserved' : [pointBElement, parseMultiUnitPlacement(pointB[1], 'horizontal'), parseMultiUnitPlacement(pointB[2], 'vertical')];

    this.connectorConfig = this.applyLineConfig(connectorConfig);
  }

  protected _onStartForward(): void {
    this.previousPointA = this.domElem.pointA;
    this.previousPointB = this.domElem.pointB;
    this.previousConnectorConfig.pointTrackingEnabled = this.domElem.pointTrackingEnabled;
    if (this.pointA !== 'use-preserved') { this.domElem.pointA = this.pointA; }
    if (this.pointB !== 'use-preserved') { this.domElem.pointB = this.pointB; }
    this.domElem.pointTrackingEnabled = this.connectorConfig.pointTrackingEnabled;
  }

  protected _onStartBackward(): void {
    this.domElem.pointA = this.previousPointA!;
    this.domElem.pointB = this.previousPointB!;
    this.domElem.pointTrackingEnabled = this.previousConnectorConfig.pointTrackingEnabled;
  }

  applyLineConfig(connectorConfig: Partial<WbfkConnectorConfig>): WbfkConnectorConfig {
    return {
      pointTrackingEnabled: this.domElem.pointTrackingEnabled,
      ...connectorConfig,
    };
  }
}

/*****************************************************************************************************************************/
/****************************************        CONNECTOR ENTRANCE        ***************************************************/
/*****************************************************************************************************************************/
export type ConnectorEntranceClipConfig = AnimClipConfig & {
  
};
export class ConnectorEntranceClip<TEffectGenerator extends EffectGenerator = EffectGenerator> extends AnimClip<TEffectGenerator> {
  public get category(): 'Connector Entrance' { return 'Connector Entrance'; }
  domElem: WbfkConnector;

  protected get defaultConfig(): Partial<ConnectorEntranceClipConfig> {
    return {
      commitsStyles: false,
      // runGeneratorsNow: true,
    };
  }

  constructor(connectorElem: WbfkConnector | null | undefined, effectName: string, effectGeneratorBank: EffectGeneratorBank) {
    super(connectorElem, effectName, effectGeneratorBank);

    if (!(connectorElem instanceof WbfkConnector)) { throw this.generateError(CustomErrors.InvalidElementError, `Must pass ${WbfkConnector.name} element.`); }
    this.domElem = connectorElem;
  }

  protected _onStartForward(): void {
    this.domElem.classList.remove('wbfk-hidden');
    this.domElem.updateEndpoints();
    if (this.domElem.pointTrackingEnabled) {
      this.domElem.continuouslyUpdateEndpoints();
    }
  }

  protected _onFinishBackward(): void {
    this.domElem.cancelContinuousUpdates();
    this.domElem.classList.add('wbfk-hidden');
  }
}

/*****************************************************************************************************************************/
/******************************************        CONNECTOR EXIT        *****************************************************/
/*****************************************************************************************************************************/
export type ConnectorExitClipConfig = AnimClipConfig & {
  
};
export class ConnectorExitClip<TEffectGenerator extends EffectGenerator = EffectGenerator> extends AnimClip<TEffectGenerator> {
  public get category(): 'Connector Exit' { return 'Connector Exit'; }
  domElem: WbfkConnector;

  protected get defaultConfig(): Partial<ConnectorExitClipConfig> {
    return {
      commitsStyles: false,
      // runGeneratorsNow: true,
    };
  }

  constructor(connectorElem: WbfkConnector | null | undefined, effectName: string, effectGeneratorBank: EffectGeneratorBank) {
    super(connectorElem, effectName, effectGeneratorBank);

    if (!(connectorElem instanceof WbfkConnector)) { throw this.generateError(CustomErrors.InvalidElementError, `Must pass ${WbfkConnector.name} element.`); }

    this.domElem = connectorElem;
  }

  protected _onStartBackward(): void {
    this.domElem.classList.remove('wbfk-hidden');
    this.domElem.updateEndpoints();
    if (this.domElem.pointTrackingEnabled) {
      this.domElem.continuouslyUpdateEndpoints();
    }
  }

  protected _onFinishForward(): void {
    this.domElem.cancelContinuousUpdates();
    this.domElem.classList.add('wbfk-hidden');
  }
}
