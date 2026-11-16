export interface AddedLine {
  file: string;
  line: number;
  text: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const ANSI_COLOR = /\x1b\[[0-9;]*m/g;

/** Extract added lines, with their new-file line numbers, from a unified diff. */
export function parseDiff(diff: string): AddedLine[] {
  const added: AddedLine[] = [];
  let file: string | null = null;
  let line = 0;
  let oldLeft = 0;
  let newLeft = 0;

  for (const raw of diff.replace(ANSI_COLOR, '').split('\n')) {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;

    // Inside a hunk body the header counts decide what a line is, so an added
    // line whose content starts with "++" is not mistaken for a "+++" header.
    if (oldLeft > 0 || newLeft > 0) {
      const marker = text[0];
      if (marker === '+') {
        if (file !== null) added.push({ file, line, text: text.slice(1) });
        line++;
        newLeft--;
        continue;
      }
      if (marker === '-') {
        oldLeft--;
        continue;
      }
      if (marker === '\\') continue;
      if (marker === ' ' || text === '') {
        line++;
        oldLeft--;
        newLeft--;
        continue;
      }
      oldLeft = newLeft = 0;
    }

    if (text.startsWith('diff ')) {
      file = null;
    } else if (text.startsWith('+++ ')) {
      file = parsePath(text.slice(4));
    } else if (text.startsWith('Binary files ') || text === 'GIT binary patch') {
      file = null;
    } else {
      const hunk = HUNK_HEADER.exec(text);
      if (hunk) {
        oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
        line = Number(hunk[2]);
        newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]);
      }
    }
  }
  return added;
}

function parsePath(spec: string): string | null {
  let path: string;
  if (spec.startsWith('"')) {
    path = unquote(spec);
  } else {
    const tab = spec.indexOf('\t');
    path = tab === -1 ? spec : spec.slice(0, tab);
  }
  if (path === '/dev/null') return null;
  return path.startsWith('b/') ? path.slice(2) : path;
}

const ESCAPES: Record<string, number> = {
  a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92,
};

/** Decode a C-style quoted path as written by git, e.g. "b/caf\303\251.txt". */
function unquote(quoted: string): string {
  const bytes: number[] = [];
  for (let i = 1; i < quoted.length; i++) {
    const c = quoted[i];
    if (c === '"') break;
    if (c === '\\') {
      const next = quoted[++i];
      if (next >= '0' && next <= '7') {
        bytes.push(parseInt(quoted.slice(i, i + 3), 8));
        i += 2;
      } else {
        bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
      }
    } else {
      const char = String.fromCodePoint(quoted.codePointAt(i)!);
      bytes.push(...Buffer.from(char));
      i += char.length - 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
