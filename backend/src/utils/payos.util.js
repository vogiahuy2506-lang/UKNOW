import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PayOS } = require('@payos/node');

const payosClient = new PayOS(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
);

export default payosClient;
