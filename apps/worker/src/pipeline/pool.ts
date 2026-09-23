/**
 * Runs `task` for every item, at most `limit` at a time, and returns the
 * results in the items' order. The first failure stops new work and is thrown.
 */
export async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	let failed = false;
	const worker = async () => {
		while (!failed && next < items.length) {
			const index = next++;
			try {
				results[index] = await task(items[index]!, index);
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	};
	await Promise.all(Array.from({length: Math.max(1, Math.min(limit, items.length))}, worker));
	return results;
}
