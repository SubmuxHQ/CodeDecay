export type JsonRecord = Record<string, unknown>;

export interface PlaywrightCommandResolution {
  ok: true;
  command: string;
}

export interface PlaywrightCommandResolutionFailure {
  ok: false;
  error: string;
}

export type PlaywrightCommandResult = PlaywrightCommandResolution | PlaywrightCommandResolutionFailure;
