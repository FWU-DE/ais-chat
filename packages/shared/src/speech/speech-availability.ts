import type { FederalStateFeatureToggles, SpeechVoice } from '../db/schema';
import { getSpeechModelVoices } from '../llm-models/llm-model-service';

export type SpeechAvailability = {
  isSpeechAvailable: boolean;
  speechVoices: SpeechVoice[];
};

const UNAVAILABLE: SpeechAvailability = { isSpeechAvailable: false, speechVoices: [] };

/**
 * Speech output requires both the federal state toggle and at least one voice
 * on the speech model. A model without voices cannot synthesize audio, so
 * offering speech would leave users with controls that always fail.
 */
export async function resolveSpeechAvailability(
  featureToggles: FederalStateFeatureToggles | undefined,
): Promise<SpeechAvailability> {
  if (featureToggles?.isSpeechModelEnabled !== true) {
    return UNAVAILABLE;
  }

  const speechVoices = await getSpeechModelVoices();

  return speechVoices.length === 0 ? UNAVAILABLE : { isSpeechAvailable: true, speechVoices };
}
