import { AnimBlockConfig } from "../AnimBlock";
import { EffectGenerator } from "../WebFlik";
import { PrefixProps } from "./utilityTypes";

type FrozenPrefix = '__';
export type FromFrozenKey<S extends string> = S extends `${FrozenPrefix}${infer key}` ? key : never;
export type FromFrozenKeys<T extends Partial<AnimBlockConfig> | undefined> = keyof { [key in Extract<keyof T, string> as FromFrozenKey<key>]: void };
export type ToFrozenKey<S extends string> = S extends `${FrozenPrefix}${string}` ? never : `${FrozenPrefix}${S}`;
export type ToFrozenKeys<T extends AnimBlockConfig> = keyof { [key in Extract<keyof T, string> as ToFrozenKey<key>]: void }

export type AddFreezableConfig<TBlockConfig extends AnimBlockConfig> = PrefixProps<TBlockConfig, FrozenPrefix> & TBlockConfig;

/**
 * Returns TBlockConfig without any props marked as frozen in TEffectGenerator's config.
 * @interface StripFrozenConfig
 * @typeParam TBlockConfig - Configuration interface for AnimBlock or an AnimBlock subclass.
 * @typeParam TEffectGenerator - An effect generator defined in any generator bank.
 */
export type StripFrozenConfig<
  TBlockConfig extends AnimBlockConfig,
  TEffectGenerator extends EffectGenerator
> = Omit<TBlockConfig, FromFrozenKeys<TEffectGenerator['config']>>;



type TranslationOffset = {
  offsetSelf: `${CssLength}, ${CssLength}`; // determines offsets to apply to both X and Y positional properties
  offsetSelfX: CssLength; // determines offset to apply to the respective positional property
  offsetSelfY: CssLength; // determines offset to apply to the respective positional property
}

// CHANGE NOTE: Use strings in the format of <number><CssLengthUnit> and remove XY things
export interface TranslateOptions extends TranslationOffset {
  translate: `${CssLength}, ${CssLength}`; // distances to travel in the X and Y directions
  translateX: CssLength; // distance to travel in the X direction
  translateY: CssLength; // distance to travel in the Y direction
}

export interface MoveToOptions extends TranslationOffset {
  // targetElem: Element; // if specified, translations will be with respect to this target element
  alignment: `${CssXAlignment} ${CssYAlignment}` // determines horizontal and vertical alignment with target element
  alignmentY: CssYAlignment; // determines vertical alignment with target element
  alignmentX: CssXAlignment; // determines horizontal alignment with target element
  offsetTarget: `${CssLength}, ${CssLength}`; // offset with respect to target's left and top bound
  offsetTargetX: CssLength; // offset based on target's left bound or width (50% pushes us 50% of the target element's width rightward)
  offsetTargetY: CssLength; // offset based on target's top bound or height (5% pushes us 50% of the target element's height downward)
  preserveX: boolean; // if true, no horizontal translation with respect to the target element (offsets still apply)
  preserveY: boolean; // if true, no vertical translation with respect to the target element (offsets still apply)
}

export type ScrollingOptions = {
  scrollableOffset?: [x: MultiUnitPlacementX | number, y: MultiUnitPlacementY | number];
  scrollableOffsetX?: MultiUnitPlacementX | number;
  scrollableOffsetY?: MultiUnitPlacementY | number;
  targetOffset?: [x: MultiUnitPlacementX | number, y: MultiUnitPlacementY | number];
  targetOffsetX?: MultiUnitPlacementX | number;
  targetOffsetY?: MultiUnitPlacementY | number;
  preserveX?: boolean;
  preserveY?: boolean;
};

export type CssLengthUnit = | 'px' | 'rem' | '%';
export type CssLength = `${number}${CssLengthUnit}`;
export type CssYAlignment = | 'top' | 'bottom' | 'center';
export type CssXAlignment = | 'left' | 'right' | 'center';

type percentage = `${number}%`;
type pixels = `${number}px`
type operator = '+' | '-';
export type MultiUnitPlacementX = percentage | pixels | CssXAlignment | `${percentage} ${operator} ${pixels}` | `${pixels} ${operator} ${percentage}` | `${CssXAlignment} ${operator} ${pixels | percentage}`;
export type MultiUnitPlacementY = percentage | pixels | CssYAlignment | `${percentage} ${operator} ${pixels}` | `${pixels} ${operator} ${percentage}` | `${CssYAlignment} ${operator} ${pixels | percentage}`;
export type ParsedMultiUnitPlacement = [percentage: number, pixels: number];

export type EffectCategory = `${'Connector ' | ''}Entrance` | `${'Connector ' | ''}Exit` | 'Emphasis' | 'Motion' | 'Transition' | 'Connector Setter' | 'Scroller'
