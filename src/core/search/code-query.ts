export function isCodeLikeQuery(query: string): boolean {
  const q = query.trim();
  return /[\w./-]+\.[a-z0-9]{1,5}$/i.test(q)
    || /\b[a-z][a-z0-9]*[A-Z]/.test(q)
    || /\b[a-z]+_[a-z0-9_]+\b/i.test(q)
    || /\b(function|class|interface|const|let|def|struct|impl|type)\s+\w+/i.test(q);
}
