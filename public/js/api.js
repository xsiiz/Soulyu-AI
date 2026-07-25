// API Calls & File Processors

async function fetchWithRetry(url, options, retries = 1) {
  try {
    const res = await fetch(url, options);
    return res;
  } catch (err) {
    if (retries > 0 && err.name !== 'AbortError') {
      console.warn('[Fetch Warning] Retrying fetch due to network error...', err);
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

async function loadAvailableModels() {
  const modelSelect = document.getElementById('modelSelect');
  if (!modelSelect) return;

  try {
    const res = await fetch('/api/models');
    const models = await res.json();
    if (models && models.length > 0) {
      modelSelect.innerHTML = '';
      
      // ซ่อน moondream (Vision Model) จาก Dropdown ให้ระบบสลับใช้อัตโนมัติเมื่อแนบรูป
      const textModels = models.filter(m => {
        const name = m.name.toLowerCase();
        return !name.includes('moondream') && !name.includes('vision') && !name.includes('llava');
      });

      const displayList = textModels.length > 0 ? textModels : models;
      const savedModel = localStorage.getItem('soulyu_selected_model');

      displayList.forEach(m => {
        const name = m.name.toLowerCase();
        let label = m.name;

        if (name.includes('code') || name.includes('coder')) {
          label = '💻 โค้ดจ้า (' + m.name + ')';
        } else if (name.includes('7b')) {
          label = '🧠 คิดหน่อย (Qwen 7B)';
        } else if (name.includes('3b')) {
          label = '⚡ ตอบด่วน (Qwen 3B)';
        }

        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = label;
        if (savedModel && savedModel === m.name) {
          opt.selected = true;
        }
        modelSelect.appendChild(opt);
      });
  } catch (err) {
    console.error('Failed to fetch models:', err);
    if (modelSelect.children.length <= 1) {
      modelSelect.innerHTML = `
        <option value="qwen2.5:3b">⚡ ตอบด่วน (Qwen 3B)</option>
        <option value="qwen2.5:7b">🧠 คิดหน่อย (Qwen 7B)</option>
        <option value="qwen2.5-coder:7b">💻 โค้ดจ้า (Qwen Coder)</option>
      `;
    }
  }
}

function regenerateLastResponse() {
  const modelSelect = document.getElementById('modelSelect');
  if (isGenerating || !modelSelect) return;
  const sess = getActiveSession();
  if (!sess || sess.messages.length < 2) return;
  
  if (sess.messages[sess.messages.length - 1].role === 'assistant') {
    sess.messages.pop();
  }
  
  const lastUserMsg = sess.messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) return;

  renderActiveSessionMessages();
  
  const aiMsgElement = appendMessageUI('assistant', '');
  currentAbortController = new AbortController();
  setGeneratingState(true);

  fetchWithRetry('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: sess.messages,
      model: modelSelect.value
    }),
    signal: currentAbortController.signal
  }).then(async res => {
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `เซิร์ฟเวอร์ตอบกลับรหัสข้อผิดพลาด ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullAiText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullAiText += decoder.decode(value, { stream: true });
      aiMsgElement.innerHTML = safeMarkedParse(fullAiText);
      lucide.createIcons();
      const scrollContainer = document.getElementById('scrollContainer');
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }

    if (fullAiText.trim() !== '') {
      sess.messages.push({ role: 'assistant', content: fullAiText });
      saveSessionsToStorage();
    } else {
      aiMsgElement.innerHTML = '<span class="text-amber-400">ไม่พบคำตอบจาก AI กรุณาลองใหม่อีกครั้ง</span>';
    }

  }).catch(err => {
    if (err.name === 'AbortError') {
      aiMsgElement.innerHTML += '<br><span class="text-xs text-amber-400 italic">[หยุดการประมวลผล]</span>';
    } else {
      aiMsgElement.innerHTML = `<span class="text-red-400">เกิดข้อผิดพลาด: ${escapeHtml(err.message || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้')}</span>`;
    }
  }).finally(() => {
    currentAbortController = null;
    setGeneratingState(false);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let extractedText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      extractedText += `--- หน้าที่ ${i} ---\n${pageText}\n\n`;
    }
    return extractedText;
  } catch (err) {
    console.error('PDF extraction failed:', err);
    return '[ไม่สามารถอ่านไฟล์ PDF ได้]';
  }
}
