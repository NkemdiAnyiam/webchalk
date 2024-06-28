import { AnimSequence } from "./AnimSequence";
import { findLastIndex } from "./utils/helpers";
import { WbfkPlaybackButton } from "./WbfkPlaybackButton";

type AnimTimelineConfig = {
  debugMode: boolean;
  timelineName: string;
  findsButtons: boolean;
};

type SequenceOperation = (sequence: AnimSequence) => void;


// playback button class constants
const PRESSED = 'playback-button--pressed';
const DISABLED_FROM_STEPPING = 'playback-button--disabledFromStepping';
const DISABLED_POINTER_FROM_STEPPING = 'playback-button--disabledPointerFromStepping'; // disables pointer
const DISABLED_FROM_EDGE = 'playback-button--disabledFromTimelineEdge'; // disables pointer and grays out button
const DISABLED_FROM_PAUSE = 'playback-button--disabledFromPause';

type PlaybackButtons = {
  [key in `${'forward' | 'backward' | 'pause' | 'toggleSkipping' | 'fastForward'}Button`]: WbfkPlaybackButton | null | undefined;
};

export class AnimTimeline {
  private static id = 0;

  readonly id; // used to uniquely identify this specific timeline
  /** @internal */animSequences: AnimSequence[] = []; // array of every AnimSequence in this timeline
  /** @internal */loadedSeqIndex = 0; // index into animSequences
  /** @internal */isAnimating = false; // true if currently in the middle of executing animations; false otherwise
  /** @internal */skippingOn = false; // used to determine whether or not all animations should be instantaneous
  /** @internal */isPaused = false;
  /** @internal */currDirection: 'forward' | 'backward' = 'forward'; // set to 'forward' after stepForward() or 'backward' after stepBackward()
  /** @internal */usingJumpTo = false; // true if currently using jumpTo()
  playbackRate = 1;
  config: AnimTimelineConfig;
  // CHANGE NOTE: AnimTimeline now stores references to in-progress sequences and also does not act directly on individual animations
  private inProgressSequences: Map<number, AnimSequence> = new Map();

  getStatus() {
    return {
      animating: this.isAnimating,
      skippingOn: this.skippingOn,
      paused: this.isPaused,
      currentDirection: this.currDirection,
      jumping: this.usingJumpTo,
      stepNumber: this.loadedSeqIndex + 1,
      atBeginning: this.atBeginning,
      atEnd: this.atEnd
    } as const;
  }

  playbackButtons: PlaybackButtons = {
    backwardButton: null,
    fastForwardButton: null,
    forwardButton: null,
    pauseButton: null,
    toggleSkippingButton: null
  };

  get numSequences(): number { return this.animSequences.length; }
  private get atBeginning(): boolean { return this.loadedSeqIndex === 0; }
  private get atEnd(): boolean { return this.loadedSeqIndex === this.numSequences; }
  private get stepNumber(): number { return this.loadedSeqIndex + 1; }

  constructor(config: Partial<AnimTimelineConfig> = {}) {
    this.id = AnimTimeline.id++;

    this.config = {
      debugMode: false,
      timelineName: '',
      findsButtons: true,
      ...config,
    };

    if (this.config.findsButtons) {
      this.playbackButtons = this.setupPlaybackControls();
    }
  }

  setupPlaybackControls(root?: HTMLElement): typeof this.playbackButtons {
    const potentialButtonsContainer = (root ?? document).querySelector(`[timeline-name="${this.config.timelineName}"]`);

    // find the button if it has the correct timeline-name directly on it
    const getButtonDirect = (action: WbfkPlaybackButton['action']) => (root ?? document).querySelector<WbfkPlaybackButton>(`wbfk-playback-button[action="${action}"][timeline-name="${this.config.timelineName}"]`);
    // find the button if it is nested in a container with the correct timeline-name and does not have a timeline-name of its own
    const getButtonGroupChild = (action: WbfkPlaybackButton['action']) => potentialButtonsContainer?.querySelector<WbfkPlaybackButton>(`wbfk-playback-button[action="${action}"]:not([timeline-name])`);
    // search for button directly, then search for child of button group
    const getButton = (action: WbfkPlaybackButton['action']) => getButtonDirect(action) ?? getButtonGroupChild(action);

    const forwardButton = getButton("step-forward");
    const backwardButton = getButton("step-backward");
    const pauseButton = getButton("pause");
    const fastForwardButton = getButton("fast-forward");
    const toggleSkippingButton = getButton("toggle-skipping");

    if (forwardButton) {
      forwardButton.activate = () => {
        if (this.isAnimating || this.isPaused || this.atEnd) { return; }
        
        forwardButton.styleActivation();
        this.step('forward', {viaButton: true}).then(() => { forwardButton.styleDeactivation(); });
      }
      forwardButton.styleActivation = () => {
        forwardButton.classList.add(PRESSED);
        backwardButton?.classList.remove(DISABLED_FROM_EDGE); // if stepping forward, we of course won't be at the left edge of timeline
        backwardButton?.classList.add(DISABLED_FROM_STEPPING);
        forwardButton.classList.add(DISABLED_POINTER_FROM_STEPPING);
      };
      forwardButton.styleDeactivation = () => {
        forwardButton.classList.remove(PRESSED);
        forwardButton.classList.remove(DISABLED_POINTER_FROM_STEPPING);
        backwardButton?.classList.remove(DISABLED_FROM_STEPPING);
        if (this.atEnd) { forwardButton.classList.add(DISABLED_FROM_EDGE); }
      };
    }

    if (backwardButton) {
      backwardButton.activate = () => {
        if (this.isAnimating || this.isPaused || this.atBeginning) { return; }

        backwardButton.styleActivation();
        this.step('backward', {viaButton: true}).then(() => { backwardButton.styleDeactivation(); });
      };

      backwardButton.styleActivation = () => {
        backwardButton.classList.add(PRESSED);
        forwardButton?.classList.remove(DISABLED_FROM_EDGE);
        forwardButton?.classList.add(DISABLED_FROM_STEPPING);
        backwardButton.classList.add(DISABLED_POINTER_FROM_STEPPING);
      };
      backwardButton.styleDeactivation = () => {
        backwardButton.classList.remove(PRESSED);
        forwardButton?.classList.remove(DISABLED_FROM_STEPPING);
        backwardButton.classList.remove(DISABLED_POINTER_FROM_STEPPING);
        if (this.atBeginning) { backwardButton.classList.add(DISABLED_FROM_EDGE); }
      };

      backwardButton.classList.add(DISABLED_FROM_EDGE);
    }

    if (pauseButton) {
      pauseButton.activate = () => {
        pauseButton.styleActivation();
        this.togglePause(true, {viaButton: true});
      };
      pauseButton.deactivate = () => {
        pauseButton.styleDeactivation();
        this.togglePause(false, {viaButton: true});
      };

      pauseButton.styleActivation = () => {
        pauseButton.active = true;
        pauseButton.classList.add(PRESSED);
        forwardButton?.classList.add(DISABLED_FROM_PAUSE);
        backwardButton?.classList.add(DISABLED_FROM_PAUSE);
      };
      pauseButton.styleDeactivation = () => {
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
        this.toggleSkipping(true, {viaButton: true});
      }
      toggleSkippingButton.deactivate = () => {
        toggleSkippingButton.styleDeactivation();
        this.toggleSkipping(false, {viaButton: true});
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

    const warnButton = (button: WbfkPlaybackButton | null | undefined, purpose: string) => {
      if (!button) {
        console.warn(`${purpose} button for timeline named "${this.config.timelineName}" not found.`);
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
        `For <wbfk-playback-button> tags to be detected, their 'timeline-name' attributes must match this timeline's 'timelineName' config option.`
        + ` If this timeline does not need to detect any buttons, you may set its 'findsButtons' config option to false.`
      );
    }

    return {
      forwardButton, backwardButton, pauseButton, fastForwardButton, toggleSkippingButton,
    };
  }

  addSequences(...animSequences: AnimSequence[]): AnimTimeline {
    for(const animSequence of animSequences) {
      animSequence.parentTimeline = this;
      animSequence.setID(this.id);
    };
    this.animSequences.push(...animSequences);

    return this;
  }

  findSequenceIndex(animSequence: AnimSequence): number {
    return this.animSequences.findIndex((_animSequence) => _animSequence === animSequence);
  }

  // CHANGE NOTE: sequences, and blocks now have base playback rates that are then compounded by parents
  setPlaybackRate(rate: number): AnimTimeline {
    this.playbackRate = rate;
    // set playback rates of currently running animations so that they don't continue to run at regular speed
    this.doForInProgressSequences(sequence => sequence.useCompoundedPlaybackRate());

    return this;
  }

  // steps forward or backward and does error-checking
  async step(direction: 'forward' | 'backward'): Promise<typeof direction>;
  /**@internal*/async step(direction: 'forward' | 'backward', options: {viaButton: boolean}): Promise<typeof direction>;
  async step(direction: 'forward' | 'backward', options?: {viaButton: boolean}): Promise<typeof direction> {
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
    return direction;
  }

  // plays current AnimSequence and increments loadedSeqIndex
  private async stepForward(): Promise<boolean> {
    this.currDirection = 'forward';
    const sequences = this.animSequences;

    if (this.config.debugMode) { console.log(`-->> ${this.loadedSeqIndex}: ${sequences[this.loadedSeqIndex].getDescription()}`); }

    const toPlay = sequences[this.loadedSeqIndex];
    this.inProgressSequences.set(toPlay.id, toPlay);
    await sequences[this.loadedSeqIndex].play(); // wait for the current AnimSequence to finish all of its animations
    this.inProgressSequences.delete(toPlay.id);

    ++this.loadedSeqIndex;
    const autoplayNext = !this.atEnd && (
      sequences[this.loadedSeqIndex - 1].autoplaysNextSequence // sequence that was just played
      || sequences[this.loadedSeqIndex].autoplays // new next sequence
    );

    return autoplayNext;
  }

  // decrements loadedSeqIndex and rewinds the AnimSequence
  private async stepBackward(): Promise<boolean> {
    this.currDirection = 'backward';
    const prevSeqIndex = --this.loadedSeqIndex;
    const sequences = this.animSequences;

    if (this.config.debugMode) { console.log(`<<-- ${prevSeqIndex}: ${sequences[prevSeqIndex].getDescription()}`); }

    const toRewind = sequences[prevSeqIndex];
    this.inProgressSequences.set(toRewind.id, toRewind);
    await sequences[prevSeqIndex].rewind();
    this.inProgressSequences.delete(toRewind.id);
    
    const autorewindPrevious = !this.atBeginning && (
      sequences[prevSeqIndex - 1].autoplaysNextSequence // new prev sequence
      || sequences[prevSeqIndex].autoplays // sequence that was just rewound
    );

    return autorewindPrevious;
  }

  jumpToSequenceTag(
    tag: string | RegExp,
    options: Partial<{
      search: 'forward-from-beginning' | 'backward-from-end' | 'forward' | 'backward';
      searchOffset: number;
      targetOffset: number;
      autoplayDetection: 'forward' | 'backward' | 'none';
    }> = {},
  ): Promise<void> {
    const {
      search = 'forward-from-beginning',
      targetOffset = 0,
      searchOffset = 0,
      autoplayDetection = 'none',
    } = options;
    return this.jumpTo({ tag, search, searchOffset, targetOffset, autoplayDetection });
  }

  jumpToPosition(
    position: 'beginning' | 'end' | number,
    options: Partial<{targetOffset: number; autoplayDetection: 'forward' | 'backward' | 'none';}> = {},
  ): Promise<void> {
    const {
      targetOffset = 0,
      autoplayDetection = 'none',
    } = options;
    return this.jumpTo({ position, targetOffset, autoplayDetection });
  }

  // immediately jumps to an AnimSequence in animSequences with the matching search arguments
  private async jumpTo(options: {
    tag: string | RegExp;
    search: 'forward' | 'backward' | 'forward-from-beginning' | 'backward-from-end';
    searchOffset: number;
    targetOffset: number;
    autoplayDetection: 'forward' | 'backward' | 'none';
  }): Promise<void>;
  private async jumpTo(options: {position: 'beginning' | 'end' | number; targetOffset: number; autoplayDetection: 'forward' | 'backward' | 'none';}): Promise<void>;
  private async jumpTo(
    options: { targetOffset: number; autoplayDetection: 'forward' | 'backward' | 'none'; } & (
      {tag: string | RegExp; search?: 'forward' | 'backward' | 'forward-from-beginning' | 'backward-from-end'; searchOffset?: number; position?: never}
      | {position: 'beginning' | 'end' | number; tag?: never}
    ),
  ): Promise<void> {
    if (this.isAnimating) { throw new Error('Cannot use jumpTo() while currently animating.'); }
    // Calls to jumpTo() must be separated using await or something that similarly prevents simultaneous execution of code
    if (this.usingJumpTo) { throw new Error('Cannot perform simultaneous calls to jumpTo() in timeline.'); }

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

    this.usingJumpTo = true;
    // if paused, then unpause to perform the jumping; then re-pause
    let wasPaused = this.isPaused;
    if (wasPaused) { this.togglePause(false); }
    // if skipping is not currently enabled, activate skipping button styling
    let wasSkipping = this.skippingOn;
    if (!wasSkipping) { this.playbackButtons.toggleSkippingButton?.styleActivation(); }

    // keep skipping forwards or backwards depending on direction of loadedSeqIndex

    const continueAutoplayForward = async () => {
      while (
        !this.atEnd
        && (this.animSequences[this.loadedSeqIndex - 1]?.autoplaysNextSequence || this.animSequences[this.loadedSeqIndex]?.autoplays)
      ) { await this.stepForward(); }
    }
    const continueAutoplayBackward = async () => {
      while (
        !this.atBeginning
        && (this.animSequences[this.loadedSeqIndex - 1]?.autoplaysNextSequence || this.animSequences[this.loadedSeqIndex]?.autoplays)
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
    if (wasPaused) { this.togglePause(true); }

    this.usingJumpTo = false;
  }

  toggleSkipping(isSkipping?: boolean): boolean;
  /**@internal*/toggleSkipping(isSkipping?: boolean, options?: {viaButton: boolean}): boolean;
  toggleSkipping(isSkipping?: boolean, options?: {viaButton: boolean}): boolean {
    this.skippingOn = isSkipping ?? !this.skippingOn;
    if (!options?.viaButton) {
      const button = this.playbackButtons.toggleSkippingButton;
      this.skippingOn ? button?.styleActivation() : button?.styleDeactivation();
    }
    // if skipping is enabled in the middle of animating, force currently running AnimSequence to finish
    if (this.skippingOn && this.isAnimating && !this.isPaused) { this.finishInProgressSequences(); }
    return this.skippingOn;
  }

  // tells the current AnimSequence(s) (really just 1 in this project iteration) to instantly finish its animations
  finishInProgressSequences(): void { this.doForInProgressSequences(sequence => sequence.finish()); }

  // pauses or unpauses playback
  togglePause(isPaused?: boolean): boolean;
  /**@internal*/togglePause(isPaused?: boolean, options?: { viaButton: boolean }): boolean;
  togglePause(isPaused?: boolean, options?: { viaButton: boolean }): boolean {
    this.isPaused = isPaused ?? !this.isPaused;
    if (this.isPaused) {
      if (!options?.viaButton) { this.playbackButtons.pauseButton?.styleActivation(); }
      this.doForInProgressSequences(sequence => sequence.pause());
    }
    else {
      if (!options?.viaButton) { this.playbackButtons.pauseButton?.styleDeactivation(); }
      this.doForInProgressSequences(sequence => sequence.unpause());
      if (this.skippingOn) { this.finishInProgressSequences(); }
    }
    return this.isPaused;
  }

  pause(): void { this.togglePause(true); }
  unpause(): void { this.togglePause(false); }

  // get all currently running animations that belong to this timeline and perform operation() with them
  private doForInProgressSequences(operation: SequenceOperation): void {
    for (const sequence of this.inProgressSequences.values()) {
      operation(sequence);
    }
  }
}
