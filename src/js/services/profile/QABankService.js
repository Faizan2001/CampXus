// Curated Q&A bank (v1) — static list per PRD
// At least 1 answer required; up to 5 answers; 150 chars max per answer

export const MAX_QA_ANSWERS = 5;
export const MIN_QA_ANSWERS = 1;
export const MAX_QA_ANSWER_LENGTH = 150;
export const MIN_QA_ANSWER_LENGTH = 10;

// Stable IDs for each question for storage in qnaResponses
const QA_BANK = [
  { id: 'three-words', text: 'Three words my friends actually use for me:' },
  { id: 'group-role', text: 'In a group project, I usually take the role of…' },
  { id: 'tiny-ritual', text: 'A tiny ritual that makes my day 1% better is…' },
  { id: 'proudest', text: 'My proudest personal achievement so far is…' },
  { id: 'niche-interest', text: 'A niche interest that tells me we’ll get along is…' },
  { id: 'ask-me', text: 'If we bump into each other on campus, ask me about…' },
  { id: 'this-semester', text: 'This semester, I’m into…' },
];

export function getCuratedQABank() {
  return QA_BANK.slice();
}
