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
    path = spec.replace(/^"|"$/g, '');
  } else {
    const tab = spec.indexOf('\t');
    path = tab === -1 ? spec : spec.slice(0, tab);
  }
  if (path === '/dev/null') return null;
  return path.startsWith('b/') ? path.slice(2) : path;
}
