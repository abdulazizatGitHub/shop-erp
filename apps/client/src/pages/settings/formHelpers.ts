/** '' on a text input means "not entered" — shared by every settings section with a nullable text field. */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
