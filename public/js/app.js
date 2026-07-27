// ==========================================
// 1. STATE & GLOBAL VARIABLES
// ==========================================
let currentUser = null;
let isRegisterMode = false;
let firebaseAuth = null;

function getStorageKey() {
  return currentUser ? `soulyu_ai_sessions_${currentUser.uid}` : 'soulyu_ai_sessions_guest';
}

let sessions = [];
let activeSessionId = null;
let currentAbortController = null;
let isGenerating = false;
let isModelSwitching = false;
let attachedFiles = [];

// ==========================================
// 2. MARKDOWN & SYNTAX HIGHLIGHTING CONFIG
// ==========================================
if (window.marked) {
  marked.setOptions({
    highlight: function (code, lang) {
      if (window.Prism && Prism.languages[lang]) {
        return Prism.highlight(code, Prism.languages[lang], lang);
      }
      return code;
    },
    breaks: true
  });

  const originalRenderer = new marked.Renderer();
  originalRenderer.code = function (code, language) {
    let rawCode = '';
    let lang = '';

    if (typeof code === 'object' && code !== null) {
      rawCode = code.text || '';
      lang = code.lang || language || '';
    } else {
      rawCode = String(code || '');
      lang = language || '';
    }

    const validLang = lang && window.Prism && Prism.languages[lang] ? lang : 'text';
    const highlighted = window.Prism && Prism.languages[validLang]
      ? Prism.highlight(rawCode, Prism.languages[validLang], validLang)
      : escapeHtml(rawCode);

    const codeId = 'code-' + Math.random().toString(36).substr(2, 9);

    return `
      <div class="relative group my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-900/90 shadow-md">
        <div class="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50 text-[11px] text-slate-400">
          <span class="font-mono uppercase text-slate-300 font-semibold">${validLang}</span>
          <button onclick="copyCodeBlock('${codeId}', this)" class="hover:text-white flex items-center gap-1 bg-slate-700/40 px-2 py-0.5 rounded transition">
            <i data-lucide="copy" class="w-3 h-3"></i> <span>คัดลอกโค้ด</span>
          </button>
        </div>
        <pre class="p-3 text-xs overflow-x-auto text-slate-200 font-mono"><code id="${codeId}">${highlighted}</code></pre>
      </div>
    `;
  };
  marked.use({ renderer: originalRenderer });
}

function safeMarkedParse(text) {
  if (typeof text !== 'string') {
    text = String(text || '');
  }
  try {
    return window.marked ? marked.parse(text) : escapeHtml(text);
  } catch (e) {
    console.error('Marked parse error:', e);
    return escapeHtml(text);
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// ==========================================
// 3. SESSION & STORAGE MANAGEMENT
// ==========================================
function loadSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    sessions = raw ? JSON.parse(raw) : [];

    // Clean empty assistant messages
    sessions.forEach(sess => {
      if (sess.messages) {
        sess.messages = sess.messages.filter(m => {
          if (m.role === 'assistant' && (!m.content || m.content.trim() === '')) return false;
          return true;
        });
      }
    });
  } catch (e) {
    console.error('Error loading sessions:', e);
    sessions = [];
  }

  if (sessions.length === 0) {
    createNewSession();
  } else {
    activeSessionId = sessions[0].id;
    renderSessionsList();
    renderActiveSessionMessages();
  }
}

function saveSessionsToStorage() {
  localStorage.setItem(getStorageKey(), JSON.stringify(sessions));
  renderSessionsList();
}

function createNewSession() {
  const newSession = {
    id: 'sess_' + Date.now(),
    title: 'การสนทนาใหม่',
    timestamp: Date.now(),
    messages: []
  };
  sessions.unshift(newSession);
  activeSessionId = newSession.id;
  saveSessionsToStorage();
  renderActiveSessionMessages();
}

function getActiveSession() {
  return sessions.find(s => s.id === activeSessionId) || sessions[0];
}

function deleteSession(id, event) {
  if (event) event.stopPropagation();
  sessions = sessions.filter(s => s.id !== id);
  if (sessions.length === 0) {
    createNewSession();
  } else {
    if (activeSessionId === id) {
      activeSessionId = sessions[0].id;
    }
    saveSessionsToStorage();
    renderActiveSessionMessages();
  }
}

function renameSession(id, event) {
  if (event) event.stopPropagation();
  const sess = sessions.find(s => s.id === id);
  if (!sess) return;

  const newTitle = prompt('พิมพ์ชื่อบทสนทนาใหม่:', sess.title);
  if (newTitle !== null && newTitle.trim() !== '') {
    sess.title = newTitle.trim();
    saveSessionsToStorage();
  }
}

function generateTitleForSession(sess, userPrompt) {
  if (!userPrompt) return;
  const cleanTitle = userPrompt.trim().replace(/\n/g, ' ').substring(0, 24);
  sess.title = cleanTitle.length < userPrompt.trim().length ? cleanTitle + '...' : cleanTitle;
  saveSessionsToStorage();
}

// ==========================================
// 4. UI RENDERING & DOM UPDATES
// ==========================================
function renderSessionsList() {
  const sessionsList = document.getElementById('sessionsList');
  const sessionCount = document.getElementById('sessionCount');
  if (!sessionsList) return;

  sessionsList.innerHTML = '';
  if (sessionCount) sessionCount.textContent = `${sessions.length} รายการ`;

  sessions.forEach(sess => {
    const isActive = sess.id === activeSessionId;
    const item = document.createElement('div');
    item.className = `group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition ${isActive
        ? 'bg-violet-600/15 text-violet-300 font-medium border border-violet-500/30'
        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
      }`;

    item.innerHTML = `
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <i data-lucide="message-square" class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-violet-400' : 'text-slate-500'}"></i>
        <span class="truncate" title="${escapeHtml(sess.title)}">${escapeHtml(sess.title)}</span>
      </div>
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
        <button onclick="renameSession('${sess.id}', event)" class="p-1 hover:text-violet-300 text-slate-500 transition" title="เปลี่ยนชื่อแชท">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="deleteSession('${sess.id}', event)" class="p-1 hover:text-rose-400 text-slate-500 transition" title="ลบแชท">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;

    item.addEventListener('click', () => {
      activeSessionId = sess.id;
      renderSessionsList();
      renderActiveSessionMessages();
      closeMobileSidebar();
    });

    sessionsList.appendChild(item);
  });

  if (window.lucide) lucide.createIcons();
}

function renderActiveSessionMessages() {
  const chatBox = document.getElementById('chatBox');
  const welcomeCard = document.getElementById('welcomeCard');
  const scrollContainer = document.getElementById('scrollContainer');
  if (!chatBox) return;

  const sess = getActiveSession();
  chatBox.innerHTML = '';

  if (!sess || sess.messages.length === 0) {
    if (welcomeCard) chatBox.appendChild(welcomeCard);
    return;
  }

  sess.messages.forEach(msg => {
    if (msg.role !== 'system') {
      appendMessageUI(msg.role, msg.content, msg.images);
    }
  });

  if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
}

function appendMessageUI(role, content, images = []) {
  const chatBox = document.getElementById('chatBox');
  const scrollContainer = document.getElementById('scrollContainer');
  const wrapper = document.createElement('div');
  const isUser = role === 'user';
  wrapper.className = isUser ? 'flex justify-end' : 'flex justify-start';

  const loadingHtml = `
    <div class="flex items-center gap-2 text-violet-400 text-xs py-1">
      <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
      <span>Soulyu AI กำลังคิดและประมวลผล...</span>
    </div>
  `;

  let imagesHtml = '';
  if (images && images.length > 0) {
    imagesHtml = `<div class="flex flex-wrap gap-2 mb-2">` +
      images.map(img => `<img src="${img.startsWith('data:') ? img : 'data:image/png;base64,' + img}" class="max-w-[200px] max-h-[200px] object-cover rounded-xl border border-slate-700 shadow">`).join('') +
      `</div>`;
  }

  let userAvatarContent = 'YOU';
  if (isUser && currentUser) {
    if (currentUser.photoURL) {
      userAvatarContent = `<img src="${currentUser.photoURL}" class="w-full h-full rounded-xl object-cover">`;
    } else if (currentUser.displayName || currentUser.email) {
      const str = currentUser.displayName || currentUser.email;
      userAvatarContent = escapeHtml(str.charAt(0).toUpperCase());
    }
  }

  wrapper.innerHTML = `
    <div class="flex gap-3 max-w-2xl ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start w-full">
      <div class="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-xs font-bold overflow-hidden ${isUser ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md' : 'bg-slate-900 text-violet-300 border border-slate-800 shadow-md'}">
        ${isUser ? userAvatarContent : '<i data-lucide="sparkles" class="w-4 h-4 text-violet-400"></i>'}
      </div>
      
      <div class="space-y-1 max-w-[85%]">
        <div class="p-4 rounded-2xl text-sm leading-relaxed ${isUser ? 'bg-indigo-600 text-white rounded-tr-none shadow-md' : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none shadow-md prose'} msg-content">
          ${imagesHtml}
          ${isUser ? escapeHtml(content).replace(/\n/g, '<br>') : (content ? safeMarkedParse(content) : loadingHtml)}
        </div>

        ${!isUser ? `
          <div class="flex items-center gap-2 px-1 text-[11px] text-slate-500">
            <button onclick="copyMessageText(this)" class="hover:text-slate-300 flex items-center gap-1 transition">
              <i data-lucide="copy" class="w-3 h-3"></i> คัดลอก
            </button>
            <span>•</span>
            <button onclick="regenerateLastResponse()" class="hover:text-slate-300 flex items-center gap-1 transition">
              <i data-lucide="rotate-cw" class="w-3 h-3"></i> สร้างคำตอบใหม่
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  if (chatBox) chatBox.appendChild(wrapper);
  if (window.lucide) lucide.createIcons();
  if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;

  return wrapper.querySelector('.msg-content');
}

function setGeneratingState(generating) {
  if (isModelSwitching) return;
  isGenerating = generating;
  const submitBtn = document.getElementById('submitBtn');
  if (!submitBtn) return;

  if (generating) {
    submitBtn.type = 'button';
    submitBtn.onclick = stopGenerating;
    submitBtn.innerHTML = `<span>หยุด</span><i data-lucide="square" class="w-3.5 h-3.5 fill-current"></i>`;
    submitBtn.className = 'bg-rose-600 hover:bg-rose-500 text-white rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-rose-600/25 shrink-0';
  } else {
    submitBtn.type = 'submit';
    submitBtn.onclick = null;
    submitBtn.innerHTML = `<span>ส่งข้อความ</span><i data-lucide="send" class="w-3.5 h-3.5"></i>`;
    submitBtn.className = 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-violet-600/25 shrink-0';
  }
  if (window.lucide) lucide.createIcons();
}

function setModelSwitchingState(switching) {
  isModelSwitching = switching;
  const userInput = document.getElementById('userInput');
  const submitBtn = document.getElementById('submitBtn');
  if (!userInput || !submitBtn) return;

  if (switching) {
    userInput.disabled = true;
    submitBtn.disabled = true;
    submitBtn.className = 'bg-slate-800 text-slate-400 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed opacity-75 shrink-0';
    submitBtn.innerHTML = `<span>กำลังเตรียมโมเดล...</span><i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i>`;
  } else {
    userInput.disabled = false;
    submitBtn.disabled = false;
    setGeneratingState(false);
  }
  if (window.lucide) lucide.createIcons();
}

function stopGenerating() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  setGeneratingState(false);
}

function copyCodeBlock(codeId, btn) {
  const codeEl = document.getElementById(codeId);
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.innerText).then(() => {
    btn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> <span class="text-emerald-400">คัดลอกแล้ว</span>`;
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="copy" class="w-3 h-3"></i> <span>คัดลอกโค้ด</span>`;
      if (window.lucide) lucide.createIcons();
    }, 2000);
  });
}

function copyMessageText(btn) {
  const container = btn.closest('.space-y-1').querySelector('.msg-content');
  if (!container) return;
  navigator.clipboard.writeText(container.innerText).then(() => {
    btn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> <span class="text-emerald-400">คัดลอกแล้ว</span>`;
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="copy" class="w-3 h-3"></i> คัดลอก`;
      if (window.lucide) lucide.createIcons();
    }, 2000);
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    const isHidden = sidebar.classList.contains('-translate-x-full');
    if (isHidden) {
      openMobileSidebar();
    } else {
      closeMobileSidebar();
    }
  } else {
    sidebar.classList.toggle('collapsed-sidebar');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.add('-translate-x-full');
  if (sidebarOverlay) sidebarOverlay.classList.add('hidden');
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('-translate-x-full');
  if (sidebarOverlay) sidebarOverlay.classList.remove('hidden');
}

// ==========================================
// 5. API CALLS & STREAM HANDLERS
// ==========================================
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
    }
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
      if (window.lucide) lucide.createIcons();
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

// ==========================================
// 6. FILE PROCESSORS
// ==========================================
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

function renderAttachedFilesPreview() {
  const attachedFilesContainer = document.getElementById('attachedFilesContainer');
  if (!attachedFilesContainer) return;

  attachedFilesContainer.innerHTML = '';
  attachedFiles.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'flex items-center gap-2 bg-slate-900 border border-slate-700/80 text-slate-200 px-2.5 py-1.5 rounded-xl text-xs shadow-md';

    if (file.isImage) {
      chip.innerHTML = `
        <img src="${file.dataUrl}" class="w-6 h-6 object-cover rounded-lg border border-slate-700 shrink-0">
        <span class="truncate max-w-[120px] text-[11px]">${escapeHtml(file.name)}</span>
        <button onclick="removeAttachedFile(${index})" class="hover:text-rose-400 text-slate-400 p-0.5 transition"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      `;
    } else {
      chip.innerHTML = `
        <i data-lucide="file-text" class="w-4 h-4 text-violet-400 shrink-0"></i>
        <span class="truncate max-w-[140px] text-[11px]">${escapeHtml(file.name)}</span>
        <button onclick="removeAttachedFile(${index})" class="hover:text-rose-400 text-slate-400 p-0.5 transition"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      `;
    }

    attachedFilesContainer.appendChild(chip);
  });
  if (window.lucide) lucide.createIcons();
}

function removeAttachedFile(index) {
  attachedFiles.splice(index, 1);
  renderAttachedFilesPreview();
}

// ==========================================
// 7. MAIN FORM SUBMISSION & DOM LISTENERS
// ==========================================
async function handleChatSubmit(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }

  if (isGenerating || isModelSwitching) return false;

  const userInput = document.getElementById('userInput');
  const modelSelect = document.getElementById('modelSelect');
  const charCounter = document.getElementById('charCounter');
  const systemPrompt = document.getElementById('systemPrompt');

  const text = userInput ? userInput.value.trim() : '';
  if (!text && attachedFiles.length === 0) return false;

  const sess = getActiveSession();
  if (!sess) return false;

  const welcomeCard = document.getElementById('welcomeCard');
  const chatBox = document.getElementById('chatBox');
  if (welcomeCard && chatBox && chatBox.contains(welcomeCard)) {
    welcomeCard.remove();
  }

  let promptContent = text;
  const imagesForPayload = [];
  const imagePreviews = [];

  attachedFiles.forEach(file => {
    if (file.isImage) {
      imagesForPayload.push(file.base64Data);
      imagePreviews.push(file.dataUrl);
    } else {
      promptContent += `\n\n📄 [เนื้อหาไฟล์แนบ: ${file.name}]\n${file.content}\n[จบเนื้อหาไฟล์ ${file.name}]`;
    }
  });

  attachedFiles = [];
  renderAttachedFilesPreview();

  appendMessageUI('user', promptContent, imagePreviews);
  if (userInput) {
    userInput.value = '';
    userInput.style.height = 'auto';
  }
  if (charCounter) charCounter.textContent = '0 ตัวอักษร';

  if (systemPrompt && systemPrompt.value && systemPrompt.value.trim() !== '') {
    if (sess.messages.length > 0 && sess.messages[0].role === 'system') {
      sess.messages[0].content = systemPrompt.value.trim();
    } else {
      sess.messages.unshift({ role: 'system', content: systemPrompt.value.trim() });
    }
  }

  const userMessageObj = { role: 'user', content: promptContent };
  if (imagesForPayload.length > 0) {
    userMessageObj.images = imagesForPayload;
  }
  sess.messages.push(userMessageObj);

  if (sess.title === 'การสนทนาใหม่' && sess.messages.filter(m => m.role === 'user').length === 1) {
    generateTitleForSession(sess, text || 'ไฟล์แนบ');
  } else {
    saveSessionsToStorage();
  }

  const aiMsgElement = appendMessageUI('assistant', '');
  currentAbortController = new AbortController();
  setGeneratingState(true);

  try {
    const response = await fetchWithRetry('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: sess.messages,
        model: modelSelect ? modelSelect.value : 'qwen2.5:3b'
      }),
      signal: currentAbortController.signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `เซิร์ฟเวอร์ตอบกลับรหัสข้อผิดพลาด ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullAiText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullAiText += chunk;

      aiMsgElement.innerHTML = safeMarkedParse(fullAiText);
      if (window.lucide) lucide.createIcons();
      const scrollContainer = document.getElementById('scrollContainer');
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }

    if (fullAiText.trim() !== '') {
      sess.messages.push({ role: 'assistant', content: fullAiText });
      saveSessionsToStorage();
    } else {
      aiMsgElement.innerHTML = '<span class="text-amber-400">ไม่พบคำตอบจาก AI กรุณาลองใหม่อีกครั้ง</span>';
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      aiMsgElement.innerHTML += '<br><span class="text-xs text-amber-400 italic">[หยุดการประมวลผลโดยผู้ใช้]</span>';
    } else {
      aiMsgElement.innerHTML = `<span class="text-red-400">เกิดข้อผิดพลาด: ${escapeHtml(err.message || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้')}</span>`;
    }
  } finally {
    currentAbortController = null;
    setGeneratingState(false);
  }
}

// Initialization on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // DOM Elements
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const systemPromptToggleBtn = document.getElementById('systemPromptToggleBtn');
  const systemPromptContainer = document.getElementById('systemPromptContainer');
  const promptChevron = document.getElementById('promptChevron');
  const systemPrompt = document.getElementById('systemPrompt');
  const saveSystemPromptBtn = document.getElementById('saveSystemPromptBtn');
  const savePromptToast = document.getElementById('savePromptToast');
  const clearAllSessionsBtn = document.getElementById('clearAllSessionsBtn');

  const chatForm = document.getElementById('chatForm');
  const userInput = document.getElementById('userInput');
  const modelSelect = document.getElementById('modelSelect');
  const charCounter = document.getElementById('charCounter');

  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');

  // Load Preferences
  const savedPrompt = localStorage.getItem('soulyu_system_prompt');
  if (savedPrompt && systemPrompt) {
    systemPrompt.value = savedPrompt;
  }

  // System Prompt Save Handler
  if (saveSystemPromptBtn) {
    saveSystemPromptBtn.addEventListener('click', () => {
      const val = systemPrompt ? systemPrompt.value.trim() : '';
      localStorage.setItem('soulyu_system_prompt', val);

      const sess = getActiveSession();
      if (sess && sess.messages) {
        if (sess.messages.length > 0 && sess.messages[0].role === 'system') {
          sess.messages[0].content = val;
        } else {
          sess.messages.unshift({ role: 'system', content: val });
        }
        saveSessionsToStorage();
      }

      if (savePromptToast) {
        savePromptToast.classList.remove('hidden');
        setTimeout(() => {
          savePromptToast.classList.add('hidden');
          if (systemPromptContainer) systemPromptContainer.classList.add('hidden');
          if (promptChevron) promptChevron.classList.remove('rotate-180');
        }, 500);
      }
    });
  }

  if (systemPrompt) {
    systemPrompt.addEventListener('input', () => {
      localStorage.setItem('soulyu_system_prompt', systemPrompt.value);
    });
  }

  // Model Selector Change Handler
  if (modelSelect) {
    modelSelect.addEventListener('change', async () => {
      const newModel = modelSelect.value;
      localStorage.setItem('soulyu_selected_model', newModel);

      setModelSwitchingState(true);
      await new Promise(r => setTimeout(r, 1000));
      setModelSwitchingState(false);
    });
  }

  // Textarea Expand & Keydown
  if (userInput) {
    userInput.addEventListener('input', () => {
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 176) + 'px';
      if (charCounter) charCounter.textContent = `${userInput.value.length} ตัวอักษร`;
    });

    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!isGenerating && !isModelSwitching) {
          handleChatSubmit(e);
        }
      }
    });
  }

  // Suggestion Chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const titleText = chip.querySelector('span.font-medium').textContent;
      if (userInput) {
        userInput.value = `ขอคำแนะนำเกี่ยวกับ: ${titleText}`;
        userInput.focus();
        userInput.dispatchEvent(new Event('input'));
      }
    });
  });

  // Attach File Listener
  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      for (const file of files) {
        const isImage = file.type.startsWith('image/');
        if (isImage) {
          const base64 = await readFileAsBase64(file);
          attachedFiles.push({
            name: file.name,
            isImage: true,
            base64Data: base64.split(',')[1],
            dataUrl: base64
          });
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          const pdfText = await extractPdfText(file);
          attachedFiles.push({
            name: file.name,
            isImage: false,
            content: pdfText
          });
        } else {
          const text = await readFileAsText(file);
          attachedFiles.push({
            name: file.name,
            isImage: false,
            content: text
          });
        }
      }

      fileInput.value = '';
      renderAttachedFilesPreview();
    });
  }

  // Form Submit Listener
  if (chatForm) {
    chatForm.addEventListener('submit', handleChatSubmit);
  }

  // Sidebar Controls
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      createNewSession();
      closeMobileSidebar();
    });
  }

  if (clearAllSessionsBtn) {
    clearAllSessionsBtn.addEventListener('click', () => {
      if (confirm('คุณต้องการล้างประวัติการสนทนาทั้งหมดหรือไม่?')) {
        sessions = [];
        localStorage.removeItem(getStorageKey());
        createNewSession();
      }
    });
  }

  if (systemPromptToggleBtn && systemPromptContainer && promptChevron) {
    systemPromptToggleBtn.addEventListener('click', () => {
      systemPromptContainer.classList.toggle('hidden');
      promptChevron.classList.toggle('rotate-180');
    });
  }

  if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', toggleSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileSidebar);
  }

  // Auth Modal & Buttons Binding
  const openAuthModalBtn = document.getElementById('openAuthModalBtn');
  const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  const toggleAuthModeBtn = document.getElementById('toggleAuthModeBtn');
  const authForm = document.getElementById('authForm');
  const logoutBtn = document.getElementById('logoutBtn');

  if (openAuthModalBtn) openAuthModalBtn.addEventListener('click', openAuthModal);
  if (closeAuthModalBtn) closeAuthModalBtn.addEventListener('click', closeAuthModal);
  if (toggleAuthModeBtn) toggleAuthModeBtn.addEventListener('click', toggleAuthMode);

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
      if (!firebaseAuth) return;
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebaseAuth.signInWithPopup(provider);
        closeAuthModal();
      } catch (err) {
        console.error('Google Sign-In Error:', err);
        const authErrorMsg = document.getElementById('authErrorMsg');
        if (authErrorMsg) {
          authErrorMsg.textContent = 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้: ' + (err.message || 'เกิดข้อผิดพลาด');
          authErrorMsg.classList.remove('hidden');
        }
      }
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!firebaseAuth) return;

      const email = document.getElementById('authEmail').value;
      const password = document.getElementById('authPassword').value;
      const authErrorMsg = document.getElementById('authErrorMsg');

      if (authErrorMsg) authErrorMsg.classList.add('hidden');

      try {
        if (isRegisterMode) {
          await firebaseAuth.createUserWithEmailAndPassword(email, password);
        } else {
          await firebaseAuth.signInWithEmailAndPassword(email, password);
        }
        closeAuthModal();
      } catch (err) {
        console.error('Auth Form Error:', err);
        if (authErrorMsg) {
          let msg = err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
          if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            msg = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
          } else if (err.code === 'auth/email-already-in-use') {
            msg = 'อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบ';
          } else if (err.code === 'auth/weak-password') {
            msg = 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
          }
          authErrorMsg.textContent = msg;
          authErrorMsg.classList.remove('hidden');
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('คุณต้องการออกจากระบบหรือไม่?')) {
        if (firebaseAuth) await firebaseAuth.signOut();
      }
    });
  }

  // Initial App Startup
  initFirebaseAuth();
  loadAvailableModels();
  loadSessionsFromStorage();
});

// ==========================================
// FIREBASE AUTHENTICATION FUNCTIONS
// ==========================================
function initFirebaseAuth() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded.');
    return;
  }

  const firebaseConfig = {

    apiKey: "AIzaSyCbK3g5QhBlO7nA2fEE-LdrPJ5cswsYf5o",

    authDomain: "soulyu-ai.firebaseapp.com",

    projectId: "soulyu-ai",

    storageBucket: "soulyu-ai.firebasestorage.app",

    messagingSenderId: "1016305688585",

    appId: "1:1016305688585:web:cd1f899e9812a40ed698d8",

    measurementId: "G-P2JF4SS1ZG"

  };


  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  firebaseAuth = firebase.auth();

  firebaseAuth.onAuthStateChanged(user => {
    currentUser = user;
    updateUserAuthUI();
    loadSessionsFromStorage();
  });
}

function updateUserAuthUI() {
  const openAuthModalBtn = document.getElementById('openAuthModalBtn');
  const userProfilePill = document.getElementById('userProfilePill');
  const userAvatar = document.getElementById('userAvatar');
  const userAvatarFallback = document.getElementById('userAvatarFallback');
  const userName = document.getElementById('userName');

  if (currentUser) {
    if (openAuthModalBtn) openAuthModalBtn.classList.add('hidden');
    if (userProfilePill) userProfilePill.classList.remove('hidden');

    const nameStr = currentUser.displayName || currentUser.email || 'User';
    if (userName) userName.textContent = nameStr.split('@')[0];

    if (currentUser.photoURL) {
      if (userAvatar) {
        userAvatar.src = currentUser.photoURL;
        userAvatar.classList.remove('hidden');
      }
      if (userAvatarFallback) userAvatarFallback.classList.add('hidden');
    } else {
      if (userAvatar) userAvatar.classList.add('hidden');
      if (userAvatarFallback) {
        userAvatarFallback.textContent = nameStr.charAt(0).toUpperCase();
        userAvatarFallback.classList.remove('hidden');
      }
    }
  } else {
    if (openAuthModalBtn) openAuthModalBtn.classList.remove('hidden');
    if (userProfilePill) userProfilePill.classList.add('hidden');
  }
}

function openAuthModal() {
  const authModal = document.getElementById('authModal');
  if (authModal) authModal.classList.remove('hidden');
}

function closeAuthModal() {
  const authModal = document.getElementById('authModal');
  const authErrorMsg = document.getElementById('authErrorMsg');
  if (authModal) authModal.classList.add('hidden');
  if (authErrorMsg) authErrorMsg.classList.add('hidden');
}

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  const authModalTitle = document.getElementById('authModalTitle');
  const authModalSubtitle = document.getElementById('authModalSubtitle');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const toggleAuthModeBtn = document.getElementById('toggleAuthModeBtn');

  if (isRegisterMode) {
    if (authModalTitle) authModalTitle.textContent = 'สมัครสมาชิกใหม่ Soulyu AI';
    if (authModalSubtitle) authModalSubtitle.textContent = 'สร้างบัญชีเพื่อจัดเก็บประวัติการสนทนาส่วนตัว';
    if (authSubmitBtn) authSubmitBtn.textContent = 'สมัครสมาชิกใหม่';
    if (toggleAuthModeBtn) toggleAuthModeBtn.innerHTML = 'มีบัญชีอยู่แล้ว? <span class="text-violet-400 font-semibold underline">เข้าสู่ระบบ</span>';
  } else {
    if (authModalTitle) authModalTitle.textContent = 'เข้าสู่ระบบ Soulyu AI';
    if (authModalSubtitle) authModalSubtitle.textContent = 'บันทึกและซิงค์ประวัติการสนทนาแยกตามบัญชีของคุณ';
    if (authSubmitBtn) authSubmitBtn.textContent = 'เข้าสู่ระบบ';
    if (toggleAuthModeBtn) toggleAuthModeBtn.innerHTML = 'ยังไม่มีบัญชี? <span class="text-violet-400 font-semibold underline">สมัครสมาชิกใหม่</span>';
  }
}
