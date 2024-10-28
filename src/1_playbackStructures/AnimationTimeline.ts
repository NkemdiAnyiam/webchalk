import { AnimSequence } from "./AnimationSequence";
import { CustomErrors, errorTip, generateError, TimelineErrorGenerator } from "../4_utils/errors";
import { getPartial } from "../4_utils/helpers";
import { PickFromArray } from "../4_utils/utilityTypes";
import { WbmtrPlaybackButton } from "../3_components/WbmtrPlaybackButton";
import { webimator } from "../Webimator";

// TYPE
/**
 * Contains configuration options used to define the details and behavior of the animation timeline.
 * @category Interfaces
 * @interface
 */
export type AnimTimelineConfig = {
  /**
   * String representing the name of the timeline.
   * This value is used to sync with `<wbmtr-playback-button>` elements that share the same
   * value in their `timeline-name` attribute.
   * @defaultValue
   * ```ts
   * ''
   * ```
   */
  timelineName: string;

  /**
   * Controls whether information about the timeline is logged to the console
   * during playback.
   * @defaultValue
   * ```ts
   * false
   * ```
   */
  debugMode: boolean;

  /**
   * If `true`, the timeline will instantly attempt to find `<wbmtr-playback-button>` elements whose
   * `timeline-name` attributes are equivalent to the timeline's `timelineName` configuration option
   * using {@link AnimTimeline.linkPlaybackButtons|linkPlaybackButtons()}.
   * @defaultValue
   * ```ts
   * true
   * ```
   * @see {@link AnimTimelineConfig.timelineName|timelineName}
   * @see {@link AnimTimeline.linkPlaybackButtons|linkPlaybackButtons()}
   */
  autoLinksButtons: boolean;
};

// TYPE
/**
 * Contains details about an timeline's current status. Returned by {@link AnimTimeline.getStatus}.
 * @see {@link AnimTimeline.getStatus}
 * @category Interfaces
 * @interface
 */
export type AnimTimelineStatus = {
  /**
   * `true` only if the timeline is in the process of playback (whether paused or unpaused).
   */
  isAnimating: boolean;

  /**
   * `true` only if skipping is currently on (for example, after using {@link AnimTimeline.turnSkippingOn|turnSkippingOn()}).
   */
  skippingOn: boolean;

  /**
   * `true` only if the timeline is paused.
   */
  isPaused: boolean;

  /**
   * The direction the timeline stepped in last (or `'forward'` if the timeline has not stepped yet).
   * - If the timeline last stepped forward, `'forward'`
   * - If the timeline last stepped backward, `'backward'`
   */
  currentDirection: AnimTimeline['currentDirection'];

  /**
   * `true` only if the timeline is currently jumping to a point (e.g., using {@link AnimTimeline.jumpToSequenceTag|jumpToSequenceTag()}).
   */
  isJumping: boolean;

  /**
   * The current sequential step number, starting from `1` at the start of an unplayed timeline.
   * - Stepping forward increments the step number by 1 for each sequence played.
   * - Stepping backward decrements the step number by 1 for each sequence rewound.
   */
  stepNumber: number;

  /**
   * `true` only if the timeline is at the very beginning (i.e., {@link AnimTimelineStatus.stepNumber | stepNumber} is `1`).
   */
  atBeginning: boolean;

  /**
   * `true` only if the timeline is at the very end (i.e., the last sequence has been played).
   */
  atEnd: boolean;
};

// TYPE
/**
 * Contains timing-related details about the timeline. Returned by {@link AnimTimeline.getTiming}.
 * @see {@link AnimTimeline.getTiming}
 * @category Interfaces
 * @interface
 */
export type AnimTimelineTiming = {
  /**
   * The playback rate of the timeline.
   * - Example: A value of `1` means 100% (the typical playback rate), and `0.5` means 50% speed.
   */
  playbackRate: number;
}

type SequenceOperation = (sequence: AnimSequence) => void;
type AsyncSequenceOperation = (sequence: AnimSequence) => Promise<unknown>;


// playback button class constants
const PRESSED = 'playback-button--pressed';
const DISABLED_FROM_STEPPING = 'playback-button--disabledFromStepping';
const DISABLED_POINTER_FROM_STEPPING = 'playback-button--disabledPointerFromStepping'; // disables pointer
const DISABLED_FROM_EDGE = 'playback-button--disabledFromTimelineEdge'; // disables pointer and grays out button
const DISABLED_FROM_PAUSE = 'playback-button--disabledFromPause';

// TYPE
type PlaybackButtons = {
  [key in `${'forward' | 'backward' | 'pause' | 'toggleSkipping' | 'fastForward'}Button`]: WbmtrPlaybackButton | null | undefined;
};
// TYPE
type PlaybackButtonPurpose = `Step ${'Forward' | 'Backward'}` | 'Pause' | 'Fast Forward' | 'Toggle Skipping';

/**
 * @hideconstructor
 * 
 * @groupDescription Property Getter Methods
 * Methods that return objects that contain various internal fields of the timeline (such as `isPaused` from `getStatus()`).
 * 
 * @groupDescription Playback Methods
 * Methods that control the playback of the animation timeline.
 * 
 * @groupDescription Timing Event Methods
 * Methods that involve listening to the progress of the animation timeline to perform tasks at specific times.
 * 
 * @groupDescription Playback UI Methods
 * Methods that control the connection between the timeline and HTML buttons.
 * 
 * @groupDescription Structure
 * Methods that relate to building the timeline or locating sequences within it.
 */
export class AnimTimeline {
  private static id = 0;

  private config: AnimTimelineConfig = {
    autoLinksButtons: true,
    debugMode: false,
    timelineName: '',
  };

  /**
   * Returns an object containing the configuration options used to
   * define the name, debugging behavior, and button-linking behavior of the timeline.
   * @returns an object containing
   * - {@link AnimTimelineConfig.autoLinksButtons|autoLinksButtons},
   * - {@link AnimTimelineConfig.debugMode|debugMode},
   * - {@link AnimTimelineConfig.timelineName|timelineName},
   * @group Property Getter Methods
   * @group Configuration
   */
  getConfig(): AnimTimelineConfig {
    return {...this.config};
  }

  /*-:**************************************************************************************************************************/
  /*-:*************************************        FIELDS & ACCESSORS        ***************************************************/
  /*-:**************************************************************************************************************************/
  /**
   * Number that uniquely identifies the timeline from other timelines.
   * Automatically generated.
   */
  readonly id;

  /**
   * The highest level of this timeline's lineage.
   * - The timeline itself (there is currently no higher possible level)
   * @group Structure
   */
  get root(): AnimTimeline { return this; }
  private animSequences: AnimSequence[] = []; // array of every AnimSequence in this timeline
  /**
   * Number of sequences in this timeline.
   * @group Structure
   */
  get numSequences(): number { return this.animSequences.length; }
  private loadedSeqIndex = 0; // index into animSequences
  // CHANGE NOTE: AnimTimeline now stores references to in-progress sequences and also does not act directly on individual animations
  private inProgressSequences: Map<number, AnimSequence> = new Map();

  // GROUP: Status
  private isAnimating = false; // true if currently in the middle of executing animations; false otherwise
  private skippingOn = false; // used to determine whether or not all animations should be instantaneous
  private isPaused = false;
  private currentDirection: 'forward' | 'backward' = 'forward'; // set to 'forward' after stepForward() or 'backward' after stepBackward()
  private isJumping = false; // true if currently using jumpTo()
  private get stepNumber(): number { return this.loadedSeqIndex + 1; }
  private get atBeginning(): boolean { return this.loadedSeqIndex === 0; }
  private get atEnd(): boolean { return this.loadedSeqIndex === this.numSequences; }
  private get lockedStructure(): boolean {
    if (this.isAnimating || this.isJumping) { return true; }
    return false;
  }

  /**
   * Returns details about an timeline's current status.
   * @returns an object containing
   * - {@link AnimTimelineStatus.isAnimating|isAnimating},
   * - {@link AnimTimelineStatus.isPaused|isPaused},
   * - {@link AnimTimelineStatus.skippingOn|skippingOn},
   * - {@link AnimTimelineStatus.currentDirection|currentDirection},
   * - {@link AnimTimelineStatus.isJumping|isJumping},
   * - {@link AnimTimelineStatus.stepNumber|stepNumber},
   * - {@link AnimTimelineStatus.atBeginning|atBeginning},
   * - {@link AnimTimelineStatus.atEnd|atEnd},
   * @group Property Getter Methods
   */
  getStatus(): AnimTimelineStatus;
  /**
   * Returns the value of a single specific property.
   * @param propName - name of the desired property
   * @ignore
   */
  getStatus<T extends keyof AnimTimelineStatus>(propName: T): AnimTimelineStatus[T];
  /**
   * Returns an object containing a subset of the object that would normally be returned.
   * @param propNames - array of strings specifying which properties should be included.
   * @ignore
   */
  getStatus<T extends (keyof AnimTimelineStatus)[]>(propNames: (keyof AnimTimelineStatus)[] | T): PickFromArray<AnimTimelineStatus, T>;
  /**
   * @group Property Getter Methods
   */
  getStatus(specifics?: keyof AnimTimelineStatus | (keyof AnimTimelineStatus)[]):
    | AnimTimelineStatus
    | AnimTimelineStatus[keyof AnimTimelineStatus]
    | Partial<Pick<AnimTimelineStatus, keyof AnimTimelineStatus>>
  {
    const result: AnimTimelineStatus = {
      isAnimating: this.isAnimating,
      skippingOn: this.skippingOn,
      isPaused: this.isPaused,
      currentDirection: this.currentDirection,
      isJumping: this.isJumping,
      stepNumber: this.stepNumber,
      atBeginning: this.atBeginning,
      atEnd: this.atEnd,
    };

    return specifics ? getPartial(result, specifics) : result;
  }

  // GROUP: Timing
  private playbackRate = 1;

  /**
   * Returns timing-related details about the timeline.
   * @returns an object containing
   * - {@link AnimTimelineStatus.playbackRate|playbackRate},
   * @group Property Getter Methods
   */
  getTiming(): AnimTimelineTiming;
  /**
   * Returns the value of a single specific property.
   * @param propName - name of the desired property
   * @ignore
   */
  getTiming<T extends keyof AnimTimelineTiming>(propName: T): AnimTimelineTiming[T];
  /**
   * Returns an object containing a subset of the object that would normally be returned.
   * @param propNames - array of strings specifying which properties should be included.
   * @ignore
   */
  getTiming<T extends (keyof AnimTimelineTiming)[]>(propNames: (keyof AnimTimelineTiming)[] | T): PickFromArray<AnimTimelineTiming, T>;
  /**
   * @group Property Getter Methods
   */
  getTiming(specifics?: keyof AnimTimelineTiming | (keyof AnimTimelineTiming)[]):
    | AnimTimelineTiming
    | AnimTimelineTiming[keyof AnimTimelineTiming]
    | Partial<Pick<AnimTimelineTiming, keyof AnimTimelineTiming>>
  {
    const result: AnimTimelineTiming = {
      playbackRate: this.playbackRate,
    };

    return specifics ? getPartial(result, specifics) : result;
  }
  
  /*-:**************************************************************************************************************************/
  /*-:*********************************        CONSTRUCTOR & INITIALIZERS        ***********************************************/
  /*-:**************************************************************************************************************************/
  /**@internal*/
  static createInstance(config: Partial<AnimTimelineConfig> | AnimSequence = {}, ...animSequences: AnimSequence[]): AnimTimeline {
    return new AnimTimeline(config, ...animSequences);
  }

  /**@internal*/
  constructor(configOrSequence: Partial<AnimTimelineConfig>| AnimSequence = {}, ...animSequence: AnimSequence[]) {
    if (webimator.timelineCreatorLock) {
      throw this.generateError(TypeError, `Illegal constructor. Timelines can only be instantiated using webimator.newTimeline().`);
    }
    webimator.timelineCreatorLock = true;
    
    this.id = AnimTimeline.id++;

    Object.assign(this.config, configOrSequence instanceof AnimSequence ? {} : configOrSequence);

    this.addSequences(...(configOrSequence instanceof AnimSequence ? [configOrSequence, ...animSequence] : animSequence));

    if (this.config.autoLinksButtons) {
      this.linkPlaybackButtons();
    }
  }

  /*-:**************************************************************************************************************************/
  /*-:****************************************        PLAYBACK UI        *******************************************************/
  /*-:**************************************************************************************************************************/
  private _playbackButtons: PlaybackButtons = {
    backwardButton: null,
    fastForwardButton: null,
    forwardButton: null,
    pauseButton: null,
    toggleSkippingButton: null,
  };

  /**
   * Object containing properties that are either references to `<wbmtr-playback-button>` elements that are connected to this timeline or `null`.
   * - A property being `null` indicates that there is currently no corresponding button on the page that is linked to this timeline.
   * @group Playback UI
   */
  get playbackButtons(): Readonly<PlaybackButtons> { return {...this._playbackButtons}; }

  /**
   * Searches the page for `<wbmtr-playback-button>` elements whose
   * `timeline-name` attributes are equivalent to this timeline's `timelineName` configuration option,
   * then links those buttons to this timeline.
   * - By default, all button types are searched for.
   * @param options - Settings to define the behavior of the search
   * @param options.searchRoot - The HTML element from which to begin searching for the buttons
   * @param options.buttonsSubset - Array of strings indicating which specific buttons we want to link
   * @returns 
   * @group Playback UI
   */
  linkPlaybackButtons(options: {
    /** The HTML element from which to begin searching for the buttons */
    searchRoot?: HTMLElement,
    /** Array of strings indicating which specific buttons we want to link. By default, all buttons are searched for */
    buttonsSubset?: PlaybackButtonPurpose[]
  } = {}): this {
    const {
      searchRoot,
      buttonsSubset = [`Step Forward`, `Step Backward`, `Fast Forward`, `Pause`, `Toggle Skipping`],
    } = options;
    const potentialButtonsContainer = (searchRoot ?? document).querySelector(`[timeline-name="${this.config.timelineName}"]`);

    // find the button if it has the correct timeline-name directly on it
    const getButtonDirect = (action: WbmtrPlaybackButton['action']) => (searchRoot ?? document).querySelector<WbmtrPlaybackButton>(`wbmtr-playback-button[action="${action}"][timeline-name="${this.config.timelineName}"]`);
    // find the button if it is nested in a container with the correct timeline-name and does not have a timeline-name of its own
    const getButtonGroupChild = (action: WbmtrPlaybackButton['action']) => potentialButtonsContainer?.querySelector<WbmtrPlaybackButton>(`wbmtr-playback-button[action="${action}"]:not([timeline-name])`);
    // search for button directly, then search for child of button group
    const getButton = (action: WbmtrPlaybackButton['action']) => getButtonDirect(action) ?? getButtonGroupChild(action);

    const forwardButton = buttonsSubset.includes('Step Forward') ? getButton("step-forward") : undefined;
    const backwardButton = buttonsSubset.includes('Step Backward') ? getButton("step-backward") : undefined;
    const pauseButton = buttonsSubset.includes('Pause') ? getButton("pause") : undefined;
    const fastForwardButton = buttonsSubset.includes('Fast Forward') ? getButton("fast-forward") : undefined;
    const toggleSkippingButton = buttonsSubset.includes('Toggle Skipping') ? getButton("toggle-skipping") : undefined;

    if (forwardButton) {
      forwardButton.activate = () => {
        if (this.isAnimating || this.isPaused || this.atEnd) { return; }
        
        forwardButton.styleActivation();
        this.step('forward', {viaButton: true}).then(() => { forwardButton.styleDeactivation(); });
      }
      forwardButton.styleActivation = () => {
        const backwardButton = this.playbackButtons.backwardButton;
        forwardButton.classList.add(PRESSED);
        backwardButton?.classList.remove(DISABLED_FROM_EDGE); // if stepping forward, we of course won't be at the left edge of timeline
        backwardButton?.classList.add(DISABLED_FROM_STEPPING);
        forwardButton.classList.add(DISABLED_POINTER_FROM_STEPPING);
      };
      forwardButton.styleDeactivation = () => {
        const backwardButton = this.playbackButtons.backwardButton;
        forwardButton.classList.remove(PRESSED);
        forwardButton.classList.remove(DISABLED_POINTER_FROM_STEPPING);
        backwardButton?.classList.remove(DISABLED_FROM_STEPPING);
        if (this.atEnd) { forwardButton.classList.add(DISABLED_FROM_EDGE); }
      };

      if (this.atEnd) {
        forwardButton.classList.add(DISABLED_FROM_EDGE);
      }
    }

    if (backwardButton) {
      backwardButton.activate = () => {
        if (this.isAnimating || this.isPaused || this.atBeginning) { return; }

        backwardButton.styleActivation();
        this.step('backward', {viaButton: true}).then(() => { backwardButton.styleDeactivation(); });
      };

      backwardButton.styleActivation = () => {
        const forwardButton = this.playbackButtons.forwardButton;
        backwardButton.classList.add(PRESSED);
        forwardButton?.classList.remove(DISABLED_FROM_EDGE);
        forwardButton?.classList.add(DISABLED_FROM_STEPPING);
        backwardButton.classList.add(DISABLED_POINTER_FROM_STEPPING);
      };
      backwardButton.styleDeactivation = () => {
        const forwardButton = this.playbackButtons.forwardButton;
        backwardButton.classList.remove(PRESSED);
        forwardButton?.classList.remove(DISABLED_FROM_STEPPING);
        backwardButton.classList.remove(DISABLED_POINTER_FROM_STEPPING);
        if (this.atBeginning) { backwardButton.classList.add(DISABLED_FROM_EDGE); }
      };

      if (this.atBeginning) {
        backwardButton.classList.add(DISABLED_FROM_EDGE);
      }
    }

    if (pauseButton) {
      pauseButton.activate = () => {
        pauseButton.styleActivation();
        this.pause({viaButton: true});
      };
      pauseButton.deactivate = () => {
        pauseButton.styleDeactivation();
        this.unpause({viaButton: true});
      };

      pauseButton.styleActivation = () => {
        const forwardButton = this.playbackButtons.forwardButton;
        const backwardButton = this.playbackButtons.backwardButton;
        pauseButton.active = true;
        pauseButton.classList.add(PRESSED);
        forwardButton?.classList.add(DISABLED_FROM_PAUSE);
        backwardButton?.classList.add(DISABLED_FROM_PAUSE);
      };
      pauseButton.styleDeactivation = () => {
        const forwardButton = this.playbackButtons.forwardButton;
        const backwardButton = this.playbackButtons.backwardButton;
        pauseButton.active = false;
        pauseButton.classList.remove(PRESSED);
        forwardButton?.classList.remove(DISABLED_FROM_PAUSE);
        backwardButton?.classList.remove(DISABLED_FROM_PAUSE);
      };
    }

    if (fastForwardButton) {
      fastForwardButton.activate = () => {
        fastForwardButton.styleActivation();
        this.setPlaybackRate(7);
      };
      fastForwardButton.deactivate = () => {
        fastForwardButton.styleDeactivation();
        this.setPlaybackRate(1);
      };

      fastForwardButton.styleActivation = () => {
        fastForwardButton.active = true;
        fastForwardButton.classList.add(PRESSED);
      };
      fastForwardButton.styleDeactivation = () => {
        fastForwardButton.active = false;
        fastForwardButton.classList.remove(PRESSED);
      };
    }

    if (toggleSkippingButton) {
      toggleSkippingButton.activate = () => {
        toggleSkippingButton.styleActivation();
        this.toggleSkipping({forceState: 'on', viaButton: true});
      }
      toggleSkippingButton.deactivate = () => {
        toggleSkippingButton.styleDeactivation();
        this.toggleSkipping({forceState: 'off', viaButton: true});
      };
      toggleSkippingButton.styleActivation = () => {
        toggleSkippingButton.classList.add(PRESSED);
        toggleSkippingButton.active = true;
      };
      toggleSkippingButton.styleDeactivation = () => {
        toggleSkippingButton.classList.remove(PRESSED);
        toggleSkippingButton.active = false;
      };
    }

    let wasWarned = false;
    const warnedList: string[] = [];

    const warnButton = (button: WbmtrPlaybackButton | null | undefined, purpose: PlaybackButtonPurpose) => {
      if (!button && buttonsSubset.includes(purpose)) {
        warnedList.push(purpose);
        wasWarned = true;
      }
    }

    warnButton(forwardButton, 'Step Forward');
    warnButton(pauseButton, 'Pause');
    warnButton(backwardButton, 'Step Backward');
    warnButton(fastForwardButton, 'Fast Forward');
    warnButton(toggleSkippingButton, 'Toggle Skipping');
    if (wasWarned) {
      console.warn(
        `Some buttons for timeline named "${this.config.timelineName}" not found.`
        + ` Missing buttons: ${warnedList.join(', ')}.`
        + errorTip(
          `For <wbmtr-playback-button> tags to be detected, their 'timeline-name' attribute (or the 'timeline-name' attribute of`
          + ` their parent container) must match this timeline's 'timelineName' configuration option.`
          + ` If this timeline does not need to detect any buttons, you may set its 'autoLinkButtons' config option to false`
        + ` to prevent this warning.`)
      );
    }

    Object.assign(this._playbackButtons, {
      forwardButton, backwardButton, pauseButton, fastForwardButton, toggleSkippingButton,
    });

    return this;
  }

  /**
   * Disables this timeline's connection to its playback buttons until re-enabled
   * using {@link AnimTimeline.enablePlaybackButtons|enablePlaybackButtons()}.
   * @group Playback UI
   */
  disablePlaybackButtons() {
    for (const button of Object.values(this.playbackButtons)) { button?.disable(); }
  }

  /**
   * Allows this timeline's linked playback buttons to trigger (and be triggered by) this timeline's playback methods.
   * - This method is only useful if the buttons were previously
   * disabled using {@link AnimTimeline.disablePlaybackButtons|disablePlaybackButtons()}.
   * @group Playback UI
   */
  enablePlaybackButtons() {
    for (const button of Object.values(this.playbackButtons)) { button?.enable(); }
  }

  /*-:**************************************************************************************************************************/
  /*-:*************************************        STRUCTURE        ****************************************************/
  /*-:**************************************************************************************************************************/
  /**
   * Adds one or more {@link AnimSequence} objects to the end of the timeline.
   * @param animSequences - comma-separated list of animation sequences
   * @returns 
   * @group Structure
   */
  addSequences(...animSequences: AnimSequence[]): this {
    if (this.lockedStructure) { throw this.generateLockedStructureError(this.addSequences.name); }

    for(const animSequence of animSequences) {
      if (!(animSequence instanceof AnimSequence)) {
        throw this.generateError(CustomErrors.InvalidChildError, `At least one of the objects being added is not an AnimSequence.`);
      }
      if (animSequence.parentTimeline) {
        // TODO: Improve error message
        throw this.generateError(CustomErrors.InvalidChildError, `At least one of the sequences being added is already part of some timeline.`);
      }
      if (animSequence.getStatus('lockedStructure')) {
        throw this.generateError(CustomErrors.InvalidChildError, `At least one of the sequences being added is in progress or in a forward finished state.`);
      }
      animSequence.setLineage(this);
    };
    this.animSequences.push(...animSequences);

    // no need to worry about backward button because it's impossible to reach or leave index 0 by adding sequences
    this.playbackButtons.forwardButton?.classList.remove(DISABLED_FROM_EDGE);

    return this;
  }

  /**
   * Adds one or more {@link AnimSequence} objects to the specified index of the sequence.
   * @param index - the index at which the sequences should be inserted
   * @param animSequences - comma-separated list of animation sequences
   * @returns 
   * @group Structure
   */
  addSequencesAt(index: number, ...animSequences: AnimSequence[]): this {
    if (this.lockedStructure) { throw this.generateLockedStructureError(this.addSequencesAt.name); }
    if (index <= this.loadedSeqIndex - 1) {
      throw this.generateError(
        CustomErrors.TimeParadoxError,
        `Adding new sequences behind sequences that have already been played is prohibited.` +
        errorTip(
          `Tip: Just as changing the past is not possible, changing parts of the timeline that have already passed is not allowed.` +
          ` In order to add sequences to a part of the timeline that has already been played, the timeline must be rewound to before that point` +
          ` (conceptually, it is always possible to change the future but never the past).`
        ),
      );
    }

    for (const animSequence of animSequences) {
      if (!(animSequence instanceof AnimSequence)) {
        throw this.generateError(CustomErrors.InvalidChildError, `At least one of the objects being added is not an AnimSequence.`);
      }
      if (animSequence.parentTimeline) {
        // TODO: Improve error message
        throw this.generateError(CustomErrors.InvalidChildError, `At least one of the sequences being added is already part of some timeline.`);
      }
      if (animSequence.getStatus('lockedStructure')) {
        throw this.generateError(CustomErrors.InvalidChildError, `At least one of the sequences being added is in progress or in a forward finished state.`);
      }
      animSequence.setLineage(this);
    }
    this.animSequences.splice(index, 0, ...animSequences);

    // no need to worry about atBeginning because it's impossible to reach or leave index 0 by adding sequences
    if (!this.atEnd) {
      this.playbackButtons.forwardButton?.classList.remove(DISABLED_FROM_EDGE);
    }

    return this;
  }

  /**
   * Removes one or more {@link AnimSequence} objects from the timeline.
   * @param animSequences - comma-separated list of animation sequences
   * @returns 
   * @group Structure
   */
  removeSequences(...animSequences: AnimSequence[]): this {
    if (this.lockedStructure) { throw this.generateLockedStructureError(this.removeSequences.name); }

    for (const animSequence of animSequences) {
      const index = this.findSequenceIndex(animSequence);
      if (index === -1) {
        // TODO: improve warning
        console.warn(`At least one of the sequences being removed from this timeline was already not in the timeline.`);
        return this;
      }
      if (index <= this.loadedSeqIndex - 1) {
        throw this.generateError(
          CustomErrors.TimeParadoxError,
          `Removing sequences that have already been played is prohibited.` +
          errorTip(
            `Tip: Just as changing the past is not possible, changing parts of the timeline that have already passed is not allowed.` +
            ` In order to remove sequences from a part of the timeline that has already been played, the timeline must be rewound to before that point` +
            ` (conceptually, it is always possible to change the future but never the past).`
          ),
        );
      }
      this.animSequences.splice(index, 1);
      animSequence.removeLineage();
    }

    // if the last sequences were removed, must account for forward button style.
    // no need to worry about atBeginning because it's impossible to reach index = 0 by removing sequences
    if (this.atEnd) {
      this.playbackButtons.forwardButton?.classList.add(DISABLED_FROM_EDGE);
    }

    return this;
  }

  /**
   * Removes a number of {@link AnimSequence} objects from the timeline based on the provided indices range (0-based).
   * @param startIndex - the starting index, inclusive
   * @param endIndex - the ending index, exclusive
   * @returns an array containing the sequences that were removed from the timeline.
   * @group Structure
   */
  removeSequencesAt(startIndex: number, endIndex: number = startIndex + 1): AnimSequence[] {
    if (this.lockedStructure) { throw this.generateLockedStructureError(this.removeSequencesAt.name); }
    if (startIndex <= this.loadedSeqIndex - 1) {
      throw this.generateError(
        CustomErrors.TimeParadoxError,
        `startIndex '${startIndex}' is falls within the range of sequences that have already been played,` +
        ` but removing sequences that have already been played is prohibited.` +
        errorTip(
          `Tip: Just as changing the past is not possible, changing parts of the timeline that have already passed is not allowed.` +
          ` In order to remove sequences from a part of the timeline that has already been played, the timeline must be rewound to before that point` +
          ` (conceptually, it is always possible to change the future but never the past).`
        ),
      );
    }

    const removalList = this.animSequences.splice(startIndex, endIndex - startIndex);
    for (const sequence of removalList) {
      sequence.removeLineage();
    }

    if (this.atEnd) {
      this.playbackButtons.forwardButton?.classList.add(DISABLED_FROM_EDGE);
    }

    return removalList;
  }

  /**
   * Finds the index of a given {@link AnimSequence} object within the timeline
   * @param animSequence - the animation sequence to search for within the timeline
   * @returns the index of {@link animSequence} within the timeline or `-1` if the sequence is not part of the timeline.
   * @group Structure
   */
  findSequenceIndex(animSequence: AnimSequence): number {
    return this.animSequences.findIndex((_animSequence) => _animSequence === animSequence);
  }

  /*-:**************************************************************************************************************************/
  /*-:*************************************        PLAYBACK METHODS        *****************************************************/
  /*-:**************************************************************************************************************************/
  // CHANGE NOTE: sequences, and clips now have base playback rates that are then compounded by parents
  /**
   * Sets the base playback rate of the timeline.
   * @param rate - the new playback rate
   * @returns 
   * @group Playback Methods
   */
  setPlaybackRate(rate: number): this {
    this.playbackRate = rate;
    // set playback rates of currently running animations so that they don't continue to run at regular speed
    this.doForInProgressSequences(sequence => sequence.useCompoundedPlaybackRate());

    return this;
  }

  // steps forward or backward and does error-checking
  // TODO: potentially move setting of this.isAniamting to stepForward() and stepBackward()
  /**
   * Takes 1 step in the specified direction.
   * - If any sequences are set to autoplay, the timeline automatically continues stepping through them.
   * @param direction - the direction in which the timeline should step
   * @returns a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise | Promise}
   * that resolves when the timeline has finished stepping.
   * @group Playback Methods
   */
  async step(direction: 'forward' | 'backward'): Promise<this>;
  /**@internal*/
  async step(direction: 'forward' | 'backward', options: {viaButton: boolean}): Promise<this>;
  async step(direction: 'forward' | 'backward', options?: {viaButton: boolean}): Promise<this> {
    if (this.isPaused) { throw new Error('Cannot step while playback is paused.'); }
    if (this.isAnimating) { throw new Error('Cannot step while already animating.'); }
    this.isAnimating = true;

    let continueOn;
    switch(direction) {
      case 'forward':
        if (!options?.viaButton) { this.playbackButtons.forwardButton?.styleActivation(); }
        // reject promise if trying to step forward at the end of the timeline
        if (this.atEnd) { return new Promise((_, reject) => {this.isAnimating = false; reject('Cannot stepForward() at end of timeline.')}); }
        do {continueOn = await this.stepForward();} while(continueOn);
        if (!options?.viaButton) { this.playbackButtons.forwardButton?.styleDeactivation(); }
        break;

      case 'backward':
        if (!options?.viaButton) { this.playbackButtons.backwardButton?.styleActivation(); }
        // reject promise if trying to step backward at the beginning of the timeline
        if (this.atBeginning) { return new Promise((_, reject) => {this.isAnimating = false; reject('Cannot stepBackward() at beginning of timeline.')}); }
        do {continueOn = await this.stepBackward();} while(continueOn);
        if (!options?.viaButton) { this.playbackButtons.backwardButton?.styleDeactivation(); }
        break;

      default:
        throw new Error(`Invalid step direction "${direction}". Must be "forward" or "backward".`);
    }

    this.isAnimating = false;
    return this;
  }

  // plays current AnimSequence and increments loadedSeqIndex
  /**
   * 
   * @returns 
   * @group Playback Methods
   */
  private async stepForward(): Promise<boolean> {
    this.currentDirection = 'forward';
    const sequences = this.animSequences;

    const loadedSeq = sequences[this.loadedSeqIndex];
    if (this.config.debugMode) { console.log(`${this.stepNumber} -->>: ${loadedSeq.getDescription()} [Tag: ${loadedSeq.getTag() || '<blank sequence tag>'}]`); }

    const toPlay = sequences[this.loadedSeqIndex];
    this.inProgressSequences.set(toPlay.id, toPlay);
    await sequences[this.loadedSeqIndex].play(); // wait for the current AnimSequence to finish all of its animations
    this.inProgressSequences.delete(toPlay.id);

    ++this.loadedSeqIndex;
    const autoplayNext = !this.atEnd && (
      sequences[this.loadedSeqIndex - 1].getTiming('autoplaysNextSequence') // sequence that was just played
      || sequences[this.loadedSeqIndex].getTiming('autoplays') // new next sequence
    );

    return autoplayNext;
  }

  // decrements loadedSeqIndex and rewinds the AnimSequence
  /**
   * 
   * @returns 
   * @group Playback Methods
   */
  private async stepBackward(): Promise<boolean> {
    this.currentDirection = 'backward';
    const prevSeqIndex = --this.loadedSeqIndex;
    const sequences = this.animSequences;

    const prevSeq = sequences[prevSeqIndex];
    if (this.config.debugMode) { console.log(`<<-- ${this.stepNumber}: ${prevSeq.getDescription()} [Tag: ${prevSeq.getTag() || '<blank sequence tag>'}]`); }

    const toRewind = sequences[prevSeqIndex];
    this.inProgressSequences.set(toRewind.id, toRewind);
    await sequences[prevSeqIndex].rewind();
    this.inProgressSequences.delete(toRewind.id);
    
    const autorewindPrevious = !this.atBeginning && (
      sequences[prevSeqIndex - 1].getTiming('autoplaysNextSequence') // new prev sequence
      || sequences[prevSeqIndex].getTiming('autoplays') // sequence that was just rewound
    );

    return autorewindPrevious;
  }

  // pauses or unpauses playback
  /**
   * Pauses the animation timeline if it is unpaused or unpauses it if it is currently paused.
   * @param options - options for the bevior of the toggle
   * @returns 
   * @group Playback Methods
   */
  togglePause(options: {
    /**@internal */
    viaButton?: boolean,
    /**
     * Explicitly instructs the method to either pause (equivalent to {@link AnimTimeline.pause | pause()})
     * or unpause (equivalent to {@link AnimTimeline.unpause | unpause()})
     */
    forceState?: 'pause' | 'unpause'
  } = {}): this {
    if (options.forceState) {
      const prevPauseState = this.isPaused;
      switch(options.forceState) {
        case 'pause': this.isPaused = true; break;
        case 'unpause': this.isPaused = false; break;
        default: {
          throw this.generateError(RangeError, `Invalid force value ${options.forceState}. Use "pause" to pause or "unpause" to unpause.`);
        }
      }
      // if toggling did nothing, just return
      if (prevPauseState === this.isPaused) { return this; }
    }
    else {
      this.isPaused = !this.isPaused;
    }

    const viaButton = options.viaButton ?? false;
    this.isPaused ? this.pause({viaButton}) : this.unpause({viaButton});
    
    return this;
  }

  /**
   * Pauses the animation timeline.
   * - If the timeline is not already in progress, it will still be paused, preventing
   * playback until unpaused.
   * @group Playback Methods
   */
  pause(): this;
  /**@internal*/
  pause(options?: { viaButton: boolean }): this;
  pause(options?: { viaButton: boolean }): this {
    this.isPaused = true;
    if (!options?.viaButton) { this.playbackButtons.pauseButton?.styleActivation(); }
    this.doForInProgressSequences(sequence => sequence.pause());
    return this;
  }
  
  /**
   * Unpauses the animation timeline.
   * - If the timeline is not currently paused, this method does nothing.
   * @group Playback Methods
   */
  unpause(): this;
  /**@internal*/
  unpause(options?: { viaButton: boolean }): this;
  unpause(options?: { viaButton: boolean }): this {
    this.isPaused = false;
    if (!options?.viaButton) { this.playbackButtons.pauseButton?.styleDeactivation(); }
    this.doForInProgressSequences(sequence => sequence.unpause());
    if (this.skippingOn) { this.finishInProgressSequences(); }
    return this;
  }

  /**
   * Jumps instantly to the sequence whose {@link AnimSequence.getTag|AnimSequence.getTag()} value matches the {@link tag} argument.
   * @param tag - string that is used to search for the target sequence with the matching {@link AnimSequence.getTag|AnimSequence.getTag()} value
   * @param options - set of options defining the behavior of the search, the offset of the jump, and whether to consider autoplay
   * @returns a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise | Promise} that
   * resolves when the timeline has finished jumping.
   * 
   * 
   * @example
   * <!-- EX:S id="AnimTimeline.jumpToSequenceTag" code-type="ts" -->
   * ```ts
   * const {Entrance, Motion, Exit} = webimator.createAnimationClipFactories();
   * const square = document.querySelector('.square');
   * 
   * const tLine = webimator.newTimeline(
   *   webimator.newSequence(
   *     {tag: 'flickering'},
   *     Entrance(square, '~appear', [], {endDelay: 500}),
   *     Exit(square, '~disappear', [], {endDelay: 500}),
   *     Entrance(square, '~appear', [], {endDelay: 500}),
   *     Exit(square, '~disappear', [], {endDelay: 500}),
   *     Entrance(square, '~appear', [], {endDelay: 500}),
   *     Exit(square, '~disappear', [], {endDelay: 500}),
   *   ),
   * 
   *   webimator.newSequence(
   *     {tag: 'move around'},
   *     Motion(square, '~translate', [{translateX: '200px'}]),
   *     Motion(square, '~translate', [{translateY: '200px'}]),
   *     Motion(square, '~translate', [{translateX: '-200px'}]),
   *     Motion(square, '~translate', [{translateY: '-200px'}]),
   *   ),
   * 
   *   webimator.newSequence(
   *     {tag: 'go away', autoplays: true},
   *     Exit(square, '~pinwheel', []),
   *   )
   * );
   * 
   * // Promise-based timer
   * async function wait(milliseconds: number) {
   *   return new Promise(resolve => setTimeout(resolve, milliseconds));
   * }
   * 
   * (async () => {
   *   // jump straight to sequence with tag "move around"
   *   await tLine.jumpToSequenceTag('move around');
   * 
   *   await wait (1000); // wait 1 second
   * 
   *   // jump to sequence whose tag contains "flick"
   *   // (so now we're back at the beginning of the timeline)
   *   await tLine.jumpToSequenceTag(/flick/);
   * 
   *   await wait (1000); // wait 1 second
   * 
   *   // jump to sequence with tag "move around"
   *   // then look forward to see if any sequences have {autoplays: true}
   *   // the next one does, so it continues, skipping to the third sequence
   *   await tLine.jumpToSequenceTag('move around', {autoplayDetection: 'forward'});
   * 
   *   await wait (1000); // wait 1 second
   * 
   *   // play the last sequence
   *   await tLine.step('forward');
   * })();
   * ```
   * <!-- EX:E id="AnimTimeline.jumpToSequenceTag" -->
   * 
   * @group Playback Methods
   */
  jumpToSequenceTag(
    tag: string | RegExp,
    options: {
      /**
       * the direction and/or the starting point of the search
       * @defaultValue
       * ```ts
       * 'forward-from-beginning'
       * ```
       */
      search?: 'forward-from-beginning' | 'backward-from-end' | 'forward' | 'backward';
      /** offset that changes the starting point of the search by the indicated amount */
      searchOffset?: number;
      /** offset that adds to the initial landing position */
      targetOffset?: number;
      /**
       * determines how the timeline should handle sequences set to autoplay once the
       * jump destination (after considering {@link options.targetOffset}) has been reached
       * - if `'none`', the timeline stays at the final landing position after the initial jumping operation.
       * - if `'forward'`, the timeline will jump forward for as long as the next sequence is supposed to autoplay after the current sequence.
       * - if `'backward'`, the timeline will jump backward for as long as the previous sequence is supposed to automatically
       * rewind after the current sequence is rewound (this is naturally only true when the current sequence is set to autoplay when the timeline steps forward).
       * @defaultValue
       * ```ts
       * 'none'
       * ```
       */
      autoplayDetection?: 'forward' | 'backward' | 'none';
    } = {},
  ): Promise<this> {
    const {
      search = 'forward-from-beginning',
      targetOffset = 0,
      searchOffset = 0,
      autoplayDetection = 'none',
    } = options;
    return this.jumpTo({ tag, search, searchOffset, targetOffset, autoplayDetection });
  }

  /**
   * Jumps instantly to the position within the timeline based on the {@link position} argument.
   * @param position - the target position within the timeline
   * @param options - set of options defining the offset of the jump and whether to consider autoplay
   * @returns a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise | Promise} that
   * resolves when the timeline has finished jumping.
   * @group Playback Methods
   */
  jumpToPosition(
    position: 'beginning' | 'end' | number,
    options: {
      /** offset that adds to the initial landing position */
      targetOffset?: number;
      /**
       * determines how the timeline should handle sequences set to autoplay once the
       * jump destination (after considering {@link options.targetOffset}) has been reached
       * - if `'none`', the timeline stays at the final landing position after the initial jumping operation.
       * - if `'forward'`, the timeline will jump forward for as long as the next sequence is supposed to autoplay after the current sequence.
       * - if `'backward'`, the timeline will jump backward for as long as the previous sequence as long as the previous sequence is supposed to automatically
       * rewind after the current sequence is rewound (this is naturally only true when the current sequence is set to autoplay when the timeline steps forward).
       * @defaultValue
       * ```ts
       * 'none'
       * ```
       */
      autoplayDetection?: 'forward' | 'backward' | 'none';
    } = {},
  ): Promise<this> {
    const {
      targetOffset = 0,
      autoplayDetection = 'none',
    } = options;
    return this.jumpTo({ position, targetOffset, autoplayDetection });
  }

  // immediately jumps to an AnimSequence in animSequences with the matching search arguments
  /**
   * @param options 
   * @group Playback Methods
   */
  private async jumpTo(options: {
    tag: string | RegExp;
    search: 'forward' | 'backward' | 'forward-from-beginning' | 'backward-from-end';
    searchOffset: number;
    targetOffset: number;
    autoplayDetection: 'forward' | 'backward' | 'none';
  }): Promise<this>;
  private async jumpTo(options: {position: 'beginning' | 'end' | number; targetOffset: number; autoplayDetection: 'forward' | 'backward' | 'none';}): Promise<this>;
  private async jumpTo(
    options: { targetOffset: number; autoplayDetection: 'forward' | 'backward' | 'none'; } & (
      {tag: string | RegExp; search?: 'forward' | 'backward' | 'forward-from-beginning' | 'backward-from-end'; searchOffset?: number; position?: never}
      | {position: 'beginning' | 'end' | number; tag?: never}
    ),
  ): Promise<this> {
    if (this.isAnimating) { throw new Error('Cannot use jumpTo() while currently animating.'); }
    // Calls to jumpTo() must be separated using await or something that similarly prevents simultaneous execution of code
    if (this.isJumping) { throw new Error('Cannot perform simultaneous calls to jumpTo() in timeline.'); }

    const { targetOffset, autoplayDetection, position, tag } = options;

    // cannot specify both tag and position
    if (tag !== undefined && position !== undefined) {
      throw new TypeError(`jumpTo() must receive either the tag or the position, not both. Received tag="${tag}" and position="${position}."`);
    }
    // can only specify one of tag or position, not both
    if (tag === undefined && position === undefined) {
      throw new TypeError(`jumpTo() must receive either the tag or the position. Neither were received.`);
    }
    if (!Number.isSafeInteger(targetOffset)) { throw new TypeError(`Invalid offset "${targetOffset}". Value must be an integer.`); }

    let targetIndex: number;

    // find target index based on finding sequence with matching tag
    // Math.max(0) prevents wrapping
    if (tag) {
      const { search = 'forward-from-beginning', searchOffset = 0 } = options;
      if (!Number.isSafeInteger(targetOffset)) { throw new TypeError(`Invalid searchOffset "${searchOffset}". Value must be an integer.`); }
      
      let isBackwardSearch = false;
      let fromIndex: number;
      switch(search) {
        case "forward":
          fromIndex = Math.max(this.loadedSeqIndex + 1 + searchOffset, 0);
          break;
        case "backward":
          fromIndex = Math.max(this.loadedSeqIndex - 1 + searchOffset, 0);
          isBackwardSearch = true;
          break;
        case "forward-from-beginning":
          fromIndex = Math.max(searchOffset, 0);
          break;
        case "backward-from-end":
          fromIndex = Math.max(this.numSequences - 1 + searchOffset, 0);
          isBackwardSearch = true;
          break;
        default:
          throw new TypeError(`Invalid search value "${search}".`);
      }
      const sequenceMatchesTag = (sequence: AnimSequence, tag: RegExp | string): boolean => tag instanceof RegExp ? tag.test(sequence.getTag()) : sequence.getTag() === tag;

      let initialIndex = -1;
      // get index corresponding to matching AnimSequence
      if (!isBackwardSearch)
        { for (let i = fromIndex; i < this.numSequences; ++i) { if (sequenceMatchesTag(this.animSequences[i], tag)) { initialIndex = i; break; } } }
      else
        { for (let i = fromIndex; i >= 0; --i) { if (sequenceMatchesTag(this.animSequences[i], tag)) { initialIndex = i; break; } } }

      if (initialIndex === -1) { throw new Error(`Sequence tag "${tag}" not found given conditions: search: ${search}; searchOffset: ${searchOffset}.`); }
      targetIndex = initialIndex + targetOffset;
    }
    // find target index based on either the beginning or end of the timeline
    else {
      switch(true) {
        case position === "beginning":
          targetIndex = 0 + targetOffset;
          break;
        case position === "end":
          targetIndex = this.numSequences + targetOffset;
          break;
        case typeof position === 'number':
          if (!Number.isSafeInteger(position)) { throw new TypeError(`Invalid position "${position}". When using a number, value must be an integer.`); }
          targetIndex = position;
          break;
        default: throw new RangeError(`Invalid jumpTo() position "${position}". Must be "beginning", "end", or an integer.`);
      }
    }

    // check to see if requested target index is within timeline bounds
    {
      const errorPrefixString = `Jumping to ${tag ? `tag "${tag}"` : `position "${position}"`} with offset "${targetOffset}" goes`;
      const errorPostfixString = `but requested index was ${targetIndex}.`;
      if (targetIndex < 0)
      { throw new RangeError(`${errorPrefixString} before timeline bounds. Minimium index = 0, ${errorPostfixString}`); }
      if (targetIndex > this.numSequences)
        { throw new RangeError(`${errorPrefixString} ahead of timeline bounds. Max index = ${this.numSequences}, ${errorPostfixString}`); }
    }

    this.isJumping = true;
    // if paused, then unpause to perform the jumping; then re-pause
    let wasPaused = this.isPaused;
    if (wasPaused) { this.unpause(); }
    // if skipping is not currently enabled, activate skipping button styling
    let wasSkipping = this.skippingOn;
    if (!wasSkipping) { this.playbackButtons.toggleSkippingButton?.styleActivation(); }

    // keep skipping forwards or backwards depending on direction of loadedSeqIndex

    const continueAutoplayForward = async () => {
      while (
        !this.atEnd
        && (this.animSequences[this.loadedSeqIndex - 1]?.getTiming('autoplaysNextSequence') || this.animSequences[this.loadedSeqIndex]?.getTiming('autoplays'))
      ) { await this.stepForward(); }
    }
    const continueAutoplayBackward = async () => {
      while (
        !this.atBeginning
        && (this.animSequences[this.loadedSeqIndex - 1]?.getTiming('autoplaysNextSequence') || this.animSequences[this.loadedSeqIndex]?.getTiming('autoplays'))
      ) { await this.stepBackward(); }
    }

    // play to the target sequence without playing the sequence
    if (this.loadedSeqIndex <= targetIndex) {
      this.playbackButtons.forwardButton?.styleActivation();
      while (this.loadedSeqIndex < targetIndex) { await this.stepForward(); }
      switch(autoplayDetection) {
        // if autoplay detection forward, play as long as the loaded sequence is supposed to be autoplayed
        case "forward":
          await continueAutoplayForward();
          break;
        // if autoplay detection backward, rewind as long as the loaded sequence is supposed to be autoplayed
        case "backward":
          await continueAutoplayBackward();
          break;
        case "none": // do nothing
        default:
          break;
      }
      this.playbackButtons.forwardButton?.styleDeactivation();
    }
    // rewind to the target sequence and rewind the sequence as well
    else {
      this.playbackButtons.backwardButton?.styleActivation();
      while (this.loadedSeqIndex > targetIndex) { await this.stepBackward(); }
      switch(autoplayDetection) {
        case "forward":
          await continueAutoplayForward();
          break;
        case "backward":
          await continueAutoplayBackward();
          break;
        case "none": // do nothing
        default:
          break;
      }
      this.playbackButtons.backwardButton?.styleDeactivation();
    }

    if (!wasSkipping) { this.playbackButtons.toggleSkippingButton?.styleDeactivation(); }
    if (wasPaused) { this.pause(); }

    this.isJumping = false;
    return this;
  }

  /**
   * Turns on skipping if it is currently off or turns it off if it is currently on.
   * @see {@link AnimTimeline.turnSkippingOn|turnSkippingOn()}
   * @param options - options defining the behavior of the toggle
   * @returns 
   * @group Playback Methods
   */
  async toggleSkipping(options: {
    /**@internal */
    viaButton?: boolean,
    /**
     * Explicitly instructs the method to either turn skipping on
     * (equivalent to {@link AnimTimeline.turnSkippingOn | turnSkippingOn()})
     * or turn skipping off (equivalent to {@link AnimTimeline.turnSkippingOff | turnSkippingOff()})
     */
    forceState?: 'on' | 'off'
  } = {}): Promise<this> {
    if (options.forceState) {
      const prevSkippingState = this.skippingOn;
      switch(options.forceState) {
        case "on": this.skippingOn = true; break;
        case "off": this.skippingOn = false; break;
        default: {
          throw this.generateError(RangeError, `Invalid force value ${options.forceState}. Use "on" to turn on skipping or "off" to turn off skipping.`);
        }
      }
      // if toggling did nothing, just return
      if (prevSkippingState === this.skippingOn) { return this; }
    }
    else {
      this.skippingOn = !this.skippingOn;
    }

    const viaButton = options.viaButton ?? false;
    return this.skippingOn ? this.turnSkippingOn({viaButton}) : this.turnSkippingOff({viaButton});
  }

  /**
   * Makes it so that any sequence that is played is finished instantly.
   * - The timeline will still pause for any roadblocks generated by {@link AnimClip.addRoadblocks}.
   * @group Playback Methods
   */
  async turnSkippingOn(): Promise<this>;
  /**@internal*/
  async turnSkippingOn(options?: { viaButton: boolean }): Promise<this>;
  async turnSkippingOn(options?: { viaButton: boolean }): Promise<this> {
    this.skippingOn = true;
    if (!options?.viaButton) { this.playbackButtons.toggleSkippingButton?.styleActivation(); }
    // if skipping is enabled in the middle of animating, force currently running AnimSequence to finish
    if (this.isAnimating && !this.isPaused) { await this.finishInProgressSequences(); }
    return this;
  }

  /**
   * Turns off the skipping effect.
   * @see {@link AnimTimeline.turnSkippingOff|turnSkippingOff()}
   * @group Playback Methods
   */
  turnSkippingOff(): this;
  /**@internal*/
  turnSkippingOff(options?: { viaButton: boolean }): this;
  turnSkippingOff(options?: { viaButton: boolean }): this {
    this.skippingOn = false;
    if (!options?.viaButton) { this.playbackButtons.toggleSkippingButton?.styleDeactivation(); }
    return this;
  }

  // tells the current AnimSequence(s) (really just 1 in this project iteration) to instantly finish its animations
  /**
   * Forces the animation sequences that are currently running within the timeline to instantly finish.
   * - After the currently running animation sequences complete, the rest of the timeline runs normally.
   * - The timeline will still pause for any roadblocks generated by {@link AnimClip.addRoadblocks}.
   * - (Currently, only 1 sequence can play at a time in a timeline, so by "sequences", we just mean "sequence").
   * @group Playback Methods
   */
  async finishInProgressSequences(): Promise<this> {
    return this.doForInProgressSequences_async(sequence => sequence.finish());
  }

  // get all currently running animations that belong to this timeline and perform operation() with them
  private doForInProgressSequences(operation: SequenceOperation): this {
    for (const sequence of this.inProgressSequences.values()) {
      operation(sequence);
    }
    return this;
  }

  private async doForInProgressSequences_async(operation: AsyncSequenceOperation): Promise<this> {
    const promises: Promise<unknown>[] = [];
    for (const sequence of this.inProgressSequences.values()) {
      promises.push(operation(sequence));
    }
    await Promise.all(promises);
    return this;
  }

  /*-:**************************************************************************************************************************/
  /*-:******************************************        ERRORS        **********************************************************/
  /*-:**************************************************************************************************************************/
  protected generateError: TimelineErrorGenerator = (ErrorClassOrInstance, msg = '<unspecified error>') => {
    return generateError(ErrorClassOrInstance, msg as string, {
      timeline: this
    });
  }

  protected generateLockedStructureError = (methodName: string) => {
    return generateError(
      CustomErrors.LockedOperationError,
      `Cannot use ${methodName}() while the timeline is in progress.`
    );
  }
}
