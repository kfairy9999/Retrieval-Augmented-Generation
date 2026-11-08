export async function resolveSearchQuery(
  question: string,
  hasHistory: boolean,
  rewrite: () => Promise<string>,
): Promise<string> {
  if (!hasHistory) return question;
  try {
    const rewritten = (await rewrite()).trim();
    return rewritten || question;
  } catch {
    return question;
  }
}
