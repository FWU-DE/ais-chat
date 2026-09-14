const SAFETY_CATEGORIES = `S1: Violent Crimes
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

export function buildGuardPrompt(text: string): string {
  return `Task: Check if there is unsafe content in the User message according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
${SAFETY_CATEGORIES}
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

User: ${text}

<END CONVERSATION>

Provide your safety assessment for the above content.`;
}
