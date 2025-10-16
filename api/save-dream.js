// API endpoint для сохранения сна в Supabase

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, text, ascii, ts } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Storage not configured' });
    }

    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    const dreamToSave = {
      id: id || `dream-${Date.now()}`,
      text,
      ascii: ascii || '',
      ts: ts || Date.now()
    };

    // Проверяем существует ли уже такой сон
    const checkResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/dreams?id=eq.${dreamToSave.id}`,
      { headers }
    );

    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      if (existing && existing.length > 0) {
        return res.status(200).json({ 
          success: true, 
          saved: false,
          message: 'Dream already exists' 
        });
      }
    }

    // Сохраняем новый сон
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/dreams`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(dreamToSave)
      }
    );

    if (response.ok) {
      return res.status(200).json({ 
        success: true, 
        saved: true
      });
    } else {
      const error = await response.text();
      console.error('Failed to save:', error);
      return res.status(500).json({ 
        error: 'Failed to save dream',
        details: error
      });
    }

  } catch (error) {
    console.error('Error saving dream:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

