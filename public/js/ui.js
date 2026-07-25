// UI Rendering & Markdown Utilities

// Configure Marked
marked.setOptions({
  highlight: function(code, lang) {
    if (Prism.languages[lang]) {
      return Prism.highlight(code, Prism.languages[lang], lang);
    }
    return code;
  },
  breaks: true
});

const originalRenderer = new marked.Renderer();
originalRenderer.code = function(code, language) {
  let rawCode = '';
  let lang = '';
  
  if (typeof code === 'object' && code !== null) {
    rawCode = code.text || '';
    lang = code.lang || language || '';
  } else {
    rawCode = String(code || '');
    lang = language || '';
  }

  const validLang = lang && Prism.languages[lang] ? lang : 'text';
  const highlighted = Prism.languages[validLang] 
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

function safeMarkedParse(text) {
  if (typeof text !== 'string') {
    text = String(text || '');
  }
  try {
    return marked.parse(text);
  } catch (e) {
    console.error('Marked parse error:', e);
    return escapeHtml(text);
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function renderSessionsList() {
  const sessionsList = document.getElementById('sessionsList');
  const sessionCount = document.getElementById('sessionCount');
  if (!sessionsList) return;

  sessionsList.innerHTML = '';
  if (sessionCount) sessionCount.textContent = `${sessions.length} รายการ`;

  sessions.forEach(sess => {
    const isActive = sess.id === activeSessionId;
    const item = document.createElement('div');
    item.className = `group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition ${
      isActive 
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

  lucide.createIcons();
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

  wrapper.innerHTML = `
    <div class="flex gap-3 max-w-2xl ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start w-full">
      <div class="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-xs font-bold ${isUser ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md' : 'bg-slate-900 text-violet-300 border border-slate-800 shadow-md'}">
        ${isUser ? 'YOU' : '<i data-lucide="sparkles" class="w-4 h-4 text-violet-400"></i>'}
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
  lucide.createIcons();
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
  lucide.createIcons();
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
  lucide.createIcons();
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
    lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="copy" class="w-3 h-3"></i> <span>คัดลอกโค้ด</span>`;
      lucide.createIcons();
    }, 2000);
  });
}

function copyMessageText(btn) {
  const container = btn.closest('.space-y-1').querySelector('.msg-content');
  if (!container) return;
  navigator.clipboard.writeText(container.innerText).then(() => {
    btn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> <span class="text-emerald-400">คัดลอกแล้ว</span>`;
    lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="copy" class="w-3 h-3"></i> คัดลอก`;
      lucide.createIcons();
    }, 2000);
  });
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
