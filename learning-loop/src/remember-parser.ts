const RE = /(?:^|\n)\s*remember this(?:\s+for us)?\s*[:\-]\s*(.+?)\s*$/im;

export function parseRememberThis(comment: string): string | null {
  const m = RE.exec(comment);
  return m ? m[1].trim() : null;
}
