// API endpoint для получения всех сохраненных снов из Supabase

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(200).json({ dreams: [], message: 'Storage not configured' });
    }

    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/dreams?select=*&order=ts.desc&limit=100`,
      { headers }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Supabase error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch dreams',
        dreams: []
      });
    }

    const dreams = await response.json();

    return res.status(200).json({
      success: true,
      dreams: dreams || [],
      total: dreams.length
    });

  } catch (error) {
    console.error('Error fetching dreams:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      dreams: []
    });
  }
}

