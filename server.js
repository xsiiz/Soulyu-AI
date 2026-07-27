const express = require('express');
const { Ollama } = require('ollama');

const app = express();
const ollama = new Ollama();

app.set('view engine', 'ejs');
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Helper function to fetch and scrape web page content
async function fetchWebPageContent(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const html = await response.text();

    // Extract page title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : url;

    // Strip HTML tags and clean up whitespace
    let cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&gt;/gi, '>')
      .replace(/&lt;/gi, '<')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit length to avoid overwhelming model memory context
    if (cleanText.length > 3500) {
      cleanText = cleanText.substring(0, 3500) + '...';
    }

    return { title: pageTitle, content: cleanText, url };
  } catch (err) {
    console.error(`Error fetching web page (${url}):`, err.message);
    return null;
  }
}

// หน้าแรกแสดง UI
app.get('/', (req, res) => {
  res.render('index');
});

// API ดึงรายชื่อโมเดลทั้งหมดจาก Ollama
app.get('/api/models', async (req, res) => {
  try {
    const response = await ollama.list();
    res.json(response.models || []);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายชื่อโมเดลได้' });
  }
});

// API สำหรับสร้างชื่อหัวข้อแชทอัตโนมัติ
app.post('/api/generate-title', async (req, res) => {
  const { prompt, model } = req.body;
  if (!prompt) return res.json({ title: 'การสนทนาใหม่' });

  try {
    const response = await ollama.generate({
      model: model || 'qwen2.5:3b',
      prompt: `ตั้งชื่อหัวข้อสั้นๆ ไม่เกิน 5 คำ โดยอิงจากข้อความต่อไปนี้ (ตอบเฉพาะชื่อหัวข้ออย่างเดียว ไม่ต้องมีเครื่องหมายอัญประกาศ): "${prompt.substring(0, 100)}"`,
      stream: false
    });
    const title = response.response ? response.response.trim().replace(/^["']|["']$/g, '') : prompt.substring(0, 25);
    res.json({ title });
  } catch (error) {
    console.error('Error generating title:', error);
    res.json({ title: prompt.substring(0, 25) });
  }
});

// API สำหรับประมวลผลแชทแบบ Stream
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body;
  const reqId = Math.random().toString(36).substring(2, 7);
  const timeStr = new Date().toLocaleTimeString('th-TH');

  req.on('close', () => {
    // Client connection closed prematurely
  });

  // กรองเฉพาะข้อความที่มีเนื้อหาถูกต้องส่งไปให้ Ollama
  const cleanMessages = (messages || []).filter(m => {
    if (!m || !m.role) return false;
    if (typeof m.content === 'string' && m.content.trim().length > 0) return true;
    if (m.images && m.images.length > 0) return true;
    return false;
  });

  // ตรวจสอบว่าในข้อความล่าสุดของผู้ใช้มี URL หรือไม่
  const lastUserMsg = cleanMessages.filter(m => m.role === 'user').pop();
  if (lastUserMsg && typeof lastUserMsg.content === 'string') {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = lastUserMsg.content.match(urlRegex);

    if (urls && urls.length > 0) {
      const targetUrl = urls[0];
      console.log(`[${timeStr}] 🌐 [Req #${reqId}] Web Scraper Intercept: ${targetUrl}`);
      const webData = await fetchWebPageContent(targetUrl);
      
      if (webData && webData.content) {
        cleanMessages.splice(cleanMessages.length - 1, 0, {
          role: 'system',
          content: `[ข้อมูลเนื้อหาจากเว็บที่ผู้ใช้ระบุ (${webData.url})]:\nชื่อหน้าเว็บ: ${webData.title}\nเนื้อหาเว็บ:\n${webData.content}`
        });
        console.log(`[${timeStr}] 🌐 [Req #${reqId}] Injected scraped web text (${webData.content.length} chars)`);
      }
    }
  }

  const hasImages = cleanMessages.some(m => m.images && m.images.length > 0);
  let targetModel = model || 'qwen2.5:3b';

  // หากมีการแนบรูปภาพมาในแชท ให้เลือกใช้ Vision Model โดยอัตโนมัติ
  if (hasImages) {
    try {
      const listRes = await ollama.list();
      const availableModels = (listRes.models || []).map(m => m.name);
      const visionModel = availableModels.find(m => m.includes('moondream')) || 
                          availableModels.find(m => m.includes('vision') || m.includes('llava') || m.includes('vl'));

      if (visionModel) {
        console.log(`[${timeStr}] 🖼️ [Req #${reqId}] Auto-Vision-Routing: ${targetModel} -> ${visionModel}`);
        targetModel = visionModel;
      }
    } catch (e) {
      console.error(`[Req #${reqId}] Error finding vision model:`, e);
    }
  }

  console.log(`\n[${timeStr}] 📩 [Req #${reqId}] Start Chat | Model: "${targetModel}" | Messages: ${cleanMessages.length} | Images: ${hasImages ? 'YES' : 'NO'}`);

  try {
    const client = new Ollama();
    let response;
    
    try {
      response = await client.chat({
        model: targetModel,
        messages: cleanMessages,
        stream: true
      });
    } catch (modelErr) {
      console.warn(`[${timeStr}] ⚠️ [Req #${reqId}] Swap Warning: ${modelErr.message}. Retrying in 800ms...`);
      await new Promise(r => setTimeout(r, 800));
      
      const retryClient = new Ollama();
      try {
        response = await retryClient.chat({
          model: targetModel,
          messages: cleanMessages,
          stream: true
        });
      } catch (retryErr) {
        if (hasImages && retryErr.message && retryErr.message.includes('does not support images')) {
          const listRes = await retryClient.list();
          const availableModels = (listRes.models || []).map(m => m.name);
          const fallbackVision = availableModels.find(m => m.includes('moondream') || m.includes('vision') || m.includes('llava'));
          if (fallbackVision) {
            response = await retryClient.chat({
              model: fallbackVision,
              messages: cleanMessages,
              stream: true
            });
          } else {
            throw new Error('ไม่พบโมเดลอ่านรูปภาพ (moondream) บนเครื่อง');
          }
        } else {
          throw retryErr;
        }
      }
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    let chunkCount = 0;
    let charCount = 0;

    for await (const chunk of response) {
      if (res.writableEnded) break;
      if (chunk.message && chunk.message.content) {
        chunkCount++;
        charCount += chunk.message.content.length;
        res.write(chunk.message.content);
      }
    }
    if (!res.writableEnded) {
      res.end();
    }
    console.log(`[${new Date().toLocaleTimeString('th-TH')}] ✅ [Req #${reqId}] Success! Streamed ${chunkCount} chunks (${charCount} chars)`);

  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString('th-TH')}] ❌ [Req #${reqId}] Error:`, error.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'เกิดข้อผิดพลาดในการประมวลผลจาก AI' });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Soulyu AI running at http://localhost:${PORT}`);
});