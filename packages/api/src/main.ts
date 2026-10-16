import { createApp } from './app.js';

const app = await createApp();
app.enableShutdownHooks();

const port = Number(process.env.API_PORT ?? 3000);
await app.listen(port, '0.0.0.0');
console.log(`API sur http://localhost:${port}/api`);
