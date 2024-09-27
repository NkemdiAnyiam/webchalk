import { AnimClip } from "../AnimClip";
import { AnimSequence } from "../AnimSequence";
import { AnimTimeline } from "../AnimTimeline";
import { getOpeningTag, indexToOrdinal } from "./helpers";

/**
 * Function that throws detailed error using additional location information based on
 * {@link AnimClip}, its target DOM element, its parent {@link AnimSequence}, and its parent {@link AnimTimeline}.
 */
export type ClipErrorGenerator = {
  /** If an Error instance is passed, the location is appended to it. */
  <TError extends Error>(
    /** The Error instance to attach the location information to */
    error: TError
  ): TError;
  /**
   * If an Error class function is passed, it is used to create an Error instance with the `msg` parameter as the error message.
   */
  <TError extends Error>(
    /** The Error class that will be instantiated */
    ErrorClass: new (message: string) => TError,
    /** The error message that will appear before the location information */
    msg: string,
    /**
     * Used to explicitly set the DOM elem in the edgecase where the error occurs in the clip's constructor
     * (where the field containing the DOM element is not yet set)
     */
    elementOverride?: Element
  ): TError;
};

/**
 * Function that throws detailed error using additional location information based on
 * {@link AnimSequence} and its parent {@link AnimTimeline}.
 */
export type SequenceErrorGenerator = {
  /** If an Error instance is passed, the location is appended to it. */
  <TError extends Error>(
    /** The Error instance to attach the location information to */
    error: TError
  ): TError;
  /**
   * If an Error class function is passed, it is used to create an Error instance with the `msg` parameter as the error message.
   */
  <TError extends Error>(
    /** The Error class that will be instantiated */
    ErrorClass: new (message: string) => TError,
    /** The error message that will appear before the location information */
    msg: string
  ): TError;
};

/**
 * Function that throws a detailed error using additional location information based on the {@link AnimTimeline}.
 */
export type TimelineErrorGenerator = {
  /** If an Error instance is passed, the location is appended to it. */
  <TError extends Error>(
    /** The Error instance to attach the location information to */
    error: TError
  ): TError;
  /**
   * If an Error class function is passed, it is used to create an Error instance with the `msg` parameter as the error message.
   */
  <TError extends Error>(
    /** The Error class that will be instantiated */
    ErrorClass: new (message: string) => TError,
    /** The error message that will appear before the location information */
    msg: string
  ): TError;
};

/**
 * Function that throws an error with additional optional location information based on
 * {@link AnimTimeline}, {@link AnimSequence}, {@link AnimClip}, or the DOM element being animated.
 */
export type GeneralErrorGenerator = {
  <TError extends Error>(
    /** The Error instance (or Error class to be instantiated) to be thrown. */
    ErrorClassOrInstance: TError | (new (message: string) => TError),
    /** Error message describing the issue */
    msg: string,
    components?: {
      /** The {@link AnimTimeline} involved in the error */
      timeline?: AnimTimeline,
      /** The {@link AnimSequence} involved in the error */
      sequence?: AnimSequence,
      /** The {@link AnimClip} involved in the error */
      clip?: AnimClip,
      /** The DOM element involved in the error */
      element?: Element
    }
  ): TError,
};

class CommitStylesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitStylesError';
  }
}

class InvalidElementError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidElementError';
  }
}

class InvalidEntranceAttempt extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEntranceAttempt';
  }
}

class InvalidExitAttempt extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExitAttempt';
  }
}

class InvalidPhasePositionError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPhasePositionError';
  }
}

class LockedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockedOperationError';
  }
}

class TimeParadoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockedOperationError';
  }
}

class ChildPlaybackError extends LockedOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'ChildPlaybackError';
  }
}

class InvalidChildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChildError';
  }
}

/**
 * @category hidden
 */
export const CustomErrors = {
  CommitStylesError,
  InvalidElementError,
  InvalidEntranceAttempt,
  InvalidExitAttempt,
  InvalidPhasePositionError,
  LockedOperationError,
  TimeParadoxError,
  ChildPlaybackError,
  InvalidChildError,
};

/**
 * Object containing WebFlik's custom Error classes.
 * 
 * @interface
 */
export type CustomErrors = typeof CustomErrors;

export const errorTip = (tip: string) => {
  return `\n\n${'*'.repeat(10)}\n${tip}\n${'*'.repeat(10)}`;
};

/**
 * Creates a detailed Error containing information about the structures involved in the error along with the error message.
 * @param ErrorClassOrInstance - The Error instance (or Error class to be instantiated) to be thrown.
 * @param msg - Error message describing the issue
 * @param components - The structures whose details should be appended to {@link msg}
 * @param components.timeline - The {@link AnimTimeline} involved in the error
 * @param components.sequence - The {@link AnimSequence} involved in the error
 * @param components.clip - The {@link AnimClip} involved in the error
 * @param components.element - The DOM element involved in the error
 * 
 * @returns An Error containing details about where exactly in the timeline and/or sequence and/or clip the error occured.
 */
export const generateError: GeneralErrorGenerator = (ErrorClassOrInstance, msg = '<unspecified error>', components = {}) => {
  const {timeline, sequence, clip, element} = components;
  const locationPostfix = (
    `\n\n${'-'.repeat(25)}LOCATION${'-'.repeat(25)}` +
    (timeline
      ? `\nTimeline: [Timeline Name: ${timeline.getConfig().timelineName}]` +
        `\n          [At Step# ${timeline.getStatus().stepNumber}]` +
        (sequence ? `\n          [At Index ${timeline.findSequenceIndex(sequence!)} (the ${indexToOrdinal(timeline.findSequenceIndex(sequence!))} sequence)]` : '') +
        ((sequence || clip) ? `\n${'-'.repeat(20)}` : '')
      : ''
    ) +
    (sequence
      ? `\nSequence: [Tag: ${sequence.getTag()}] [Description: ${sequence.getDescription()}]` +
        (clip ? `\n          [At Index ${sequence.findClipIndex(clip!)} (the ${indexToOrdinal(sequence.findClipIndex(clip!))} clip)]` : '') +
        (clip ? `\n${'-'.repeat(20)}` : '')
      : ''
    ) +
    (clip
      ? `\nClip:     [Category: ${clip.getEffectDetails('category')}] [Effect: ${clip.getEffectDetails('effectName')}]` +
        `\nDOM Tag:  ${getOpeningTag(element)}`
      : ''
    ) +
    `\n${'-'.repeat(58)}`
  );
  if (ErrorClassOrInstance instanceof Error) {
    /** @ts-ignore */
    return (new ErrorClassOrInstance.constructor(ErrorClassOrInstance.message + locationPostfix, {cause: ErrorClassOrInstance}));
  }
  return new ErrorClassOrInstance(`${msg}` + locationPostfix);
};
