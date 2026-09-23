// Groups caption words into spoken lines, so a caption page never mixes the
// end of one sentence with the start of the next (which showed upcoming words
// seconds early). A pause longer than GAP frames starts a new line.

export type CaptionWord = {text: string; start: number; end: number};

const GAP = 6;

export function captionLines(words: readonly CaptionWord[]): CaptionWord[][] {
	const sorted = [...words].sort((a, b) => a.start - b.start);
	const lines: CaptionWord[][] = [];
	for (const word of sorted) {
		const line = lines.at(-1);
		const last = line?.at(-1);
		if (line && last && word.start - last.end <= GAP) line.push(word);
		else lines.push([word]);
	}
	return lines;
}
