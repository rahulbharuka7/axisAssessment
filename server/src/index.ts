import { createApp } from './app.js';
import { getDb } from './db/index.js';

const PORT = Number(process.env.PORT ?? 4000);

getDb(); // apply schema on boot
createApp().listen(PORT, () => {
  console.log(`Axis Assessment API  →  http://localhost:${PORT}/ai-assessment/api/v1`);
});
