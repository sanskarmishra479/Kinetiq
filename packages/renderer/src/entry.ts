import {getInputProps, registerRoot} from 'remotion';
import {Root} from './Root';
import {installCsp} from './runtime/csp';

// Entry of the deployed render bundle. The CSP goes in before any scene code
// can run (NFR-SEC-12).
const origins = (getInputProps() as {assetOrigins?: unknown}).assetOrigins;
installCsp(document, Array.isArray(origins) ? origins.filter((o): o is string => typeof o === 'string') : []);

registerRoot(Root);
