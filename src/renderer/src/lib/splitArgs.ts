/**
 * Splits the Settings "Arguments" field into an argv array, honouring quoted
 * segments so a single argument can contain spaces.
 *
 * This is deliberately NOT shell parsing — the result goes to execFile with no
 * shell, so pipes, globs and `;` are passed through as literal argument text
 * rather than interpreted. A user who wants shell behaviour asks for it
 * explicitly by making the command `sh` with `-c`.
 */
export function splitArgs(input: string): string[] {
  const matches = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return matches.map((a) =>
    (a.startsWith('"') && a.endsWith('"')) || (a.startsWith("'") && a.endsWith("'"))
      ? a.slice(1, -1)
      : a
  );
}
