const fs = require('fs').promises;
const path = require('path');

// Configuration for high concurrency
const DB_PATH = path.join(process.cwd(), 'assets', 'db', 'waitlist.csv');
const LOCK_PATH = path.join(process.cwd(), 'assets', 'db', 'waitlist.lock');
const MAX_RETRIES = 12; // Increased for higher concurrency

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Valid email is required' });
  }

  const timestamp = new Date().toISOString();
  const entry = `${email.replace(/,/g, '')},${timestamp}\n`; // Sanitize commas for CSV

  // --- FAIL-SAFE: Structured Logging ---
  // On Vercel (Production), the filesystem is read-only. 
  // This log allows you to extract the waitlist from Vercel Logs even if the file isn't written.
  console.log(`WAITLIST_ENTRY|${email}|${timestamp}`);

  let success = false;
  let attempt = 0;

  while (attempt < MAX_RETRIES && !success) {
    try {
      // 1. Acquire Atomic Lock (mkdir is an atomic operation at OS level)
      await fs.mkdir(LOCK_PATH);

      try {
        // 2. Critical Section: High-speed append
        await fs.appendFile(DB_PATH, entry);
        success = true;
      } catch (appendErr) {
        if (appendErr.code === 'ENOENT') {
          // File doesn't exist yet, initialize it
          await fs.writeFile(DB_PATH, 'email,timestamp\n' + entry);
          success = true;
        } else {
          throw appendErr;
        }
      } finally {
        // 3. Release Lock
        await fs.rmdir(LOCK_PATH);
      }
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock currently held by another request - wait then retry
        attempt++;
        // Intelligent backoff: wait longer as we retry, plus jitter
        const delay = Math.floor(Math.random() * 50) + (attempt * 30);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // If its a filesystem error (like read-only on Vercel), we log it and break
        console.error('CONCURRENCY_LOG_ERROR:', err.message);
        break; 
      }
    }
  }

  if (success) {
    return res.status(200).json({ status: 'success', source: 'file' });
  } else {
    // Return 200 because we captured the data in the console stream (Fail-Safe)
    return res.status(200).json({ status: 'success', source: 'stream' });
  }
};
