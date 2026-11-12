// Honour the preview runner's port without changing production startup.
const portIndex = process.argv.indexOf('--port');
if (portIndex !== -1 && /^\d+$/.test(process.argv[portIndex + 1] || '')) process.env.PORT = process.argv[portIndex + 1];
require('../server');
