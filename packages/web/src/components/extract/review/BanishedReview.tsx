import type { BanishedPhrase, BanishedWord } from "../../../api/extract";
import { TagInput } from "../../manifest/TagInput";

interface BanishedReviewProps {
  words: BanishedWord[];
  phrases: BanishedPhrase[];
  onWordsChange: (next: BanishedWord[]) => void;
  onPhrasesChange: (next: BanishedPhrase[]) => void;
}

export function BanishedReview({
  words,
  phrases,
  onWordsChange,
  onPhrasesChange,
}: BanishedReviewProps): JSX.Element {
  const wordStrings = words.map((w) => (w.frequency > 0 ? `${w.word} (${w.frequency}×)` : w.word));
  const phraseStrings = phrases.map((p) =>
    p.frequency > 0 ? `${p.phrase} (${p.frequency}×)` : p.phrase,
  );

  const setWords = (next: string[]): void => {
    onWordsChange(next.map((s) => ({ word: s.replace(/\s*\(\d+×\)\s*$/, ""), frequency: 0 })));
  };
  const setPhrases = (next: string[]): void => {
    onPhrasesChange(next.map((s) => ({ phrase: s.replace(/\s*\(\d+×\)\s*$/, ""), frequency: 0 })));
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Banished</h2>
      <TagInput label="Words" htmlId="br-words" values={wordStrings} onChange={setWords} />
      <TagInput label="Phrases" htmlId="br-phrases" values={phraseStrings} onChange={setPhrases} />
    </section>
  );
}
