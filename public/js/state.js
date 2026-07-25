// State Management & LocalStorage Handler
const STORAGE_KEY = 'soulyu_ai_sessions';

let sessions = [];
let activeSessionId = null;
let currentAbortController = null;
let isGenerating = false;
let isModelSwitching = false;
let attachedFiles = [];

function loadSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    sessions = raw ? JSON.parse(raw) : [];
    
    // ทำความสะอาดข้อความว่างเปล่าของ assistant ออกจากประวัติ
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
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
