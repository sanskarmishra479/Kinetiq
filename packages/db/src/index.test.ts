import {expect, it} from 'vitest';
import {PACKAGE_NAME} from './index.js';

it('loads', () => {
	expect(PACKAGE_NAME).toBe('@kinetiq/db');
});
