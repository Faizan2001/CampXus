# Normalization Spec — Keys & Fields

## Day Patterns (canonical)
- S=Sunday, M=Monday, T=Tuesday, W=Wednesday, A=Thursday, F=Friday, R=Saturday
- Combined: ST (Sun+Tue), MW (Mon+Wed), AR (Thu+Sat), TR (Tue+Thu), MWF (Mon+Wed+Fri), plus single days.
- Preserve campus ordering when building strings (e.g., ST, MW, AR).

## Course Normalization
- courseName: trim → collapse spaces → lowercase → strip diacritics. If name ends with `...`, is <3 tokens, or low alpha ratio, fall back to courseCode for naming.
- courseCode: as parsed; if ends with `L`, annotate display as “Lab”.
- section: parseInt; key uses zero‑padded `"02"`; display uses `S-2`.
- dayPattern: from parser `dayCode` (ST, MW, AR, TR, MWF, or single day letter).
- timeStart/timeEnd: `HH:mm` (24h). Round to nearest known slot if off by a minute.
- timeSlot: `HHmm-HHmm` derived from start/end.
- classroom: uppercase; remove spaces and hyphens. Treat Lab rooms (GPLab, CENLAB2, etc.) as normal; exclude ONLINE/TBA/NA/NONE from space creation.
- university: short code (e.g., `iub`).

## Canonical Key & spaceId
- Key elements: university, courseName (or courseCode fallback for slug), section, dayPattern, timeSlot, classroom.
- `spaceId = `${university}__${courseNameSlugOrCode}__sec${section}__${dayPattern}__${timeSlot}__${classroom}``
- Display name: `"{courseCodeOrName} • S-{n} • {dayPattern} {HH:mm–HH:mm}"`.

## Helpers (signatures)
```ts
type NormalizedCourse = {
  courseName: string;
  courseCode?: string;
  section: number;
  dayPattern: string; // ST|MW|AR|TR|MWF|S|M|T|W|A|F|R
  timeStart: string; // HH:mm
  timeEnd: string;   // HH:mm
  timeSlot: string;  // HHmm-HHmm
  classroom: string; // NAC902, GPLab, CENLAB2
};

function normalizeCourseForSave(parsed: any): NormalizedCourse;
function buildSpaceKey(course: NormalizedCourse & { university: string }): string;
function chooseDisplayName(bucket: NormalizedCourse[]): { title: string };
```

