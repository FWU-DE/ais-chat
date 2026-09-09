export const SAFETY_CATEGORIES = `S1: Violent Crimes
S2: Non-Violent Crimes
S3: Sex-Related Crimes
S4: Child Sexual Exploitation
S5: Defamation
S6: Specialized Advice
S7: Privacy
S8: Intellectual Property
S9: Indiscriminate Weapons
S10: Hate
S11: Suicide & Self-Harm
S12: Sexual Content
S13: Elections
S14: Code Interpreter Abuse`;

import type { SafetyMessage } from './types';

export function buildGuardPrompt(messages: SafetyMessage[]): string {
  const conversation = messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n');

  return `Task: Check if there is unsafe content in the conversation according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
${SAFETY_CATEGORIES}
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

${conversation}

<END CONVERSATION>

Return exactly one of these formats and nothing else:
- safe
- unsafe S1
- unsafe S1 S2

Use unsafe followed by every violated category code. If no category is violated, return safe.
Provide your safety assessment for the above content.`;
}
