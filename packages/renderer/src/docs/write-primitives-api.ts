import {writeFileSync} from 'node:fs';
import {API_MD, generatePrimitivesApi} from './primitives-api.js';

writeFileSync(API_MD, generatePrimitivesApi());
process.stdout.write(`wrote ${API_MD}\n`);
