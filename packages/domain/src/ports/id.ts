// Id source for domain logic. Production uses random ids; tests use SeqId.
export interface IdPort {
	/** Returns a new id such as "prj_01j9...". */
	next(prefix: string): string;
}
