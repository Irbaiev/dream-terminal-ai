// API для хранения снов в Supabase
// Supabase - бесплатная PostgreSQL база данных

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Получаем настройки Supabase из переменных окружения
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      // Если нет настроек, возвращаем пустой массив
      if (req.method === 'GET') {
        return res.status(200).json({ dreams: [], message: 'Storage not configured' });
      }
      return res.status(500).json({ error: 'Storage not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to Vercel env variables' });
    }

    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    // GET - получить все сны
    if (req.method === 'GET') {
      try {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/dreams?select=*&order=ts.desc&limit=100`,
          { headers }
        );
        
        if (response.ok) {
          const dreams = await response.json();
          console.log('✅ Загружено снов из Supabase:', dreams.length);
          return res.status(200).json({ 
            dreams: dreams || [],
            total: dreams.length
          });
        } else {
          const error = await response.text();
          console.error('❌ Ошибка Supabase:', error);
          return res.status(200).json({ dreams: [], error });
        }
      } catch (e) {
        console.error('❌ Fetch error:', e);
        return res.status(200).json({ dreams: [], error: e.message });
      }
    }

    // POST - сохранить новый сон
    if (req.method === 'POST') {
      const newDream = req.body;
      
      if (!newDream.text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const dreamToSave = {
        id: newDream.id || `dream-${Date.now()}`,
        text: newDream.text || '',
        ascii: newDream.ascii || '',
        ts: newDream.ts || Date.now()
      };

      // Проверяем существует ли уже такой сон
      try {
        const checkResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/dreams?id=eq.${dreamToSave.id}`,
          { headers }
        );
        
        if (checkResponse.ok) {
          const existing = await checkResponse.json();
          if (existing && existing.length > 0) {
            console.log('⚠️ Сон уже существует:', dreamToSave.id);
            return res.status(200).json({ success: true, saved: false, message: 'Already exists' });
          }
        }
      } catch (e) {
        console.error('⚠️ Ошибка при проверке дубликата:', e);
      }

      // Сохраняем новый сон
      try {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/dreams`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(dreamToSave)
          }
        );

        if (response.ok) {
          console.log('✅ Сон сохранен в Supabase:', dreamToSave.id);
          return res.status(200).json({ success: true, saved: true });
        } else {
          const error = await response.text();
          console.error('❌ Ошибка при сохранении:', error);
          return res.status(500).json({ error: 'Failed to save dream', details: error });
        }
      } catch (e) {
        console.error('❌ Ошибка при сохранении:', e);
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('❌ Общая ошибка:', error);
    return res.status(500).json({ error: error.message });
  }
}

