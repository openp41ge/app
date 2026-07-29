/**
 * Openp41ge SVG icon set — flat line icons rendered as inline SVGs.
 *
 * All icons use currentColor so they inherit the parent text colour.
 * Dimensions are 16x16 viewBox by default; use the `size` parameter to scale.
 */

function icon(viewBox: string, paths: string[], size = 16): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths.join("")}</svg>`;
}

/** File icon — document with folded corner */
export function fileIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<path d="M4 1H10L13 4V14C13 14.5523 12.5523 15 12 15H4C3.44772 15 3 14.5523 3 14V2C3 1.44772 3.44772 1 4 1Z"/>`,
      `<path d="M10 1V4H13"/>`,
    ],
    size,
  );
}

/** Folder-closed icon — closed folder */
export function folderClosedIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<path d="M2 3.5C2 2.94772 2.44772 2.5 3 2.5H6L7.5 4H13C13.5523 4 14 4.44772 14 5V12.5C14 13.0523 13.5523 13.5 13 13.5H3C2.44772 13.5 2 13.0523 2 12.5V3.5Z"/>`,
    ],
    size,
  );
}

/** Document with lines — for markdown / text files */
export function docIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<path d="M3.5 1.5H10L13.5 5V14C13.5 14.2761 13.2761 14.5 13 14.5H3.5C3.22386 14.5 3 14.2761 3 14V2C3 1.72386 3.22386 1.5 3.5 1.5Z"/>`,
      `<path d="M10 1.5V5H13.5"/>`,
      `<line x1="5" y1="8" x2="11" y2="8"/>`,
      `<line x1="5" y1="10.5" x2="11" y2="10.5"/>`,
      `<line x1="5" y1="13" x2="9" y2="13"/>`,
    ],
    size,
  );
}

/** Chevron right — for collapsed folders / context menu */
export function chevronRight(size?: number): string {
  return icon("0 0 16 16", [`<polyline points="6,4 10,8 6,12"/>`], size);
}

/** Chevron down — for expanded folders */
export function chevronDown(size?: number): string {
  return icon("0 0 16 16", [`<polyline points="4,6 8,10 12,6"/>`], size);
}

/** Grid / table icon */
export function gridIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<rect x="2" y="2" width="5" height="5" rx="0.5"/>`,
      `<rect x="9" y="2" width="5" height="5" rx="0.5"/>`,
      `<rect x="2" y="9" width="5" height="5" rx="0.5"/>`,
      `<rect x="9" y="9" width="5" height="5" rx="0.5"/>`,
    ],
    size,
  );
}

/** Play / video icon */
export function playIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<rect x="2" y="2.5" width="12" height="11" rx="2"/>`,
      `<polygon points="6,5 11,8 6,11" fill="currentColor" stroke="none"/>`,
    ],
    size,
  );
}

/** Terminal icon */
export function terminalIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>`,
      `<path d="M5 6L7 8L5 10"/>`,
      `<line x1="9" y1="10" x2="11" y2="10"/>`,
    ],
    size,
  );
}

/** Plus icon — for add actions */
export function plusIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [`<line x1="8" y1="3" x2="8" y2="13"/>`, `<line x1="3" y1="8" x2="13" y2="8"/>`],
    size,
  );
}

/** Thick plus icon — heavier stroke for the add-repository button */
export function plusIconThick(size?: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size ?? 16}" height="${size ?? 16}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`;
}

/** Git branch icon — for worktree rows */
export function gitBranchIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<circle cx="5" cy="3.5" r="2"/>`,
      `<circle cx="12" cy="3.5" r="2"/>`,
      `<circle cx="5" cy="12.5" r="2"/>`,
      `<path d="M5 5.5V10.5"/>`,
      `<path d="M12 5.5L5.5 9.5"/>`,
    ],
    size,
  );
}

/** File added icon — green plus */
export function fileAddedIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<circle cx="8" cy="8" r="6"/>`,
      `<line x1="8" y1="5" x2="8" y2="11"/>`,
      `<line x1="5" y1="8" x2="11" y2="8"/>`,
    ],
    size,
  );
}

/** File deleted icon — red minus */
export function fileDeletedIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [`<circle cx="8" cy="8" r="6"/>`, `<line x1="5" y1="8" x2="11" y2="8"/>`],
    size,
  );
}

/** File modified icon — amber tilde */
export function fileModifiedIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [`<circle cx="8" cy="8" r="6"/>`, `<path d="M5.5 9.5C6.5 7.5 9.5 7.5 10.5 9.5"/>`],
    size,
  );
}

/** File renamed icon — blue arrow */
export function fileRenamedIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [`<circle cx="8" cy="8" r="6"/>`, `<path d="M7 5.5L10.5 8L7 10.5"/>`],
    size,
  );
}

/** Git commit icon — circle with connecting horizontal lines */
export function gitCommitIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<line x1="2" y1="8" x2="5" y2="8"/>`,
      `<circle cx="8" cy="8" r="3"/>`,
      `<line x1="11" y1="8" x2="14" y2="8"/>`,
    ],
    size,
  );
}

/** Eye icon — visible toggle */
export function eyeIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z"/>`,
      `<circle cx="8" cy="8" r="2.5"/>`,
    ],
    size,
  );
}

/** Eye-off icon — hidden toggle */
export function eyeOffIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z"/>`,
      `<circle cx="8" cy="8" r="2.5"/>`,
      `<line x1="2" y1="2" x2="14" y2="14"/>`,
    ],
    size,
  );
}

/** Git info icon — small "i" in a circle, for the git info button */
export function gitInfoIcon(size?: number): string {
  return icon(
    "0 0 16 16",
    [
      `<circle cx="8" cy="8" r="6"/>`,
      `<line x1="8" y1="7" x2="8" y2="11"/>`,
      `<circle cx="8" cy="5.2" r="0.8" fill="currentColor" stroke="none"/>`,
    ],
    size,
  );
}

/** Projects icon — stacked folders (activity bar) */
export function projectsIcon(size?: number): string {
  const s = size ?? 20;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z" fill="currentColor"/>
    <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="currentColor"/>
  </svg>`;
}

/** Refresh icon — circular arrow with fill */
export function refreshIcon(size?: number): string {
  const s = size ?? 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="${s}" height="${s}" fill="currentColor"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/></svg>`;
}

/** Git icon — branching/forking commit history (activity bar) */
export function gitIcon(size?: number): string {
  const s = size ?? 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="${s}" height="${s}" fill="currentColor"><path d="M352.5-325.5Q298-371 284-440H80v-80h204q14-69 68.5-114.5T480-680q73 0 127.5 45.5T676-520h204v80H676q-14 69-68.5 114.5T480-280q-73 0-127.5-45.5ZM480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Z"/></svg>`;
}
