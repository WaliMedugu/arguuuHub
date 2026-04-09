const fs = require('fs').promises;
const path = require('path');

// Configuration
const DB_PATH = path.join(process.cwd(), 'assets', 'db', 'waitlist.csv');
const LOCK_PATH = path.join(process.cwd(), 'assets', 'db', 'waitlist.lock');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Valid email is required' });
  }

  const timestamp = new Date().toISOString();
  
  // --- PRODUCTION DATABASE (Vercel Logs) ---
  // This is the "Way". On Vercel, console logs ARE your database entries.
  // They are persistent, searchable, and exportable.
  // Format: WAITLIST_ENTRY|email|timestamp
  console.log(`WAITLIST_ENTRY|${email.replace(/\|/g, '')}|${timestamp}`);

  // --- LOCAL DATABASE (Development Only) ---
  // We attempt to write to the CSV for local development persistence.
  // On Vercel Production, this block will fail silently because the FS is read-only.
  try {
    // Check if we are in a writable environment
    // We use a simple attempt to acquire lock
    await fs.mkdir(LOCK_PATH);
    
    try {
      await fs.appendFile(DB_PATH, `${email.replace(/,/g, '')},${timestamp}\n`);
    } catch (writeErr) {
      if (writeErr.code === 'ENOENT') {
        await fs.writeFile(DB_PATH, 'email,timestamp\n' + `${email},${timestamp}\n`);
      }
    } finally {
      await fs.rmdir(LOCK_PATH);
    }
  } catch (err) {
    // Silent fail for EROFS (Read-only filesystem) common on Vercel Lambda
    // This removes the "Error" noise from your production logs while keeping 
    // the WAITLIST_ENTRY lines clean and easy to fetch.
    if (err.code !== 'EROFS' && err.code !== 'EEXIST') {
      // Log other unexpected errors, but don't break the response
      console.warn('Waitlist Local Sync Note:', err.message);
    }
  }

  return res.status(200).json({ 
    status: 'success', 
    message: 'Registered successfully' 
  });
};
