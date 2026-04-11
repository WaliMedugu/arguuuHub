const fs = require('fs').promises;
const path = require('path');

// Configuration
const DB_PATH = path.join(process.cwd(), 'assets', 'db', 'bugs.csv');
const LOCK_PATH = path.join(process.cwd(), 'assets', 'db', 'bugs.lock');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { email, category, description, device } = req.body;
  if (!email || !description) {
    return res.status(400).json({ message: 'Email and description are required' });
  }

  const timestamp = new Date().toISOString();
  
  // --- PRODUCTION DATABASE (Vercel Logs) ---
  // On Vercel, console logs are persistent and searchable.
  // Format: BUG_REPORT|email|category|description|device|timestamp
  const logEntry = `BUG_REPORT|${email.replace(/\|/g, '')}|${category}|${description.replace(/\|/g, '').replace(/\n/g, ' ')}|${(device || 'N/A').replace(/\|/g, '')}|${timestamp}`;
  console.log(logEntry);

  // --- LOCAL DATABASE (Development Only) ---
  // On Vercel Production, this block will fail silently because the FS is read-only.
  try {
    const csvEntry = `"${email.replace(/"/g, '""')}","${category}","${description.replace(/"/g, '""')}","${(device || 'N/A').replace(/"/g, '""')}","${timestamp}"\n`;
    
    // Check if we are in a writable environment
    await fs.mkdir(LOCK_PATH);
    
    try {
      await fs.appendFile(DB_PATH, csvEntry);
    } catch (writeErr) {
      if (writeErr.code === 'ENOENT') {
        const header = 'email,category,description,device,timestamp\n';
        await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
        await fs.writeFile(DB_PATH, header + csvEntry);
      }
    } finally {
      await fs.rmdir(LOCK_PATH);
    }
  } catch (err) {
    if (err.code !== 'EROFS' && err.code !== 'EEXIST') {
      console.warn('Bug Report Local Sync Note:', err.message);
    }
  }

  return res.status(200).json({ 
    status: 'success', 
    message: 'Report submitted successfully' 
  });
};
