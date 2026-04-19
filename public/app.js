let currentSuggestions = [];
let chatContacts = [];
let activeContact = "";
let miniSchedule = [];

async function fetchDashboard() {
  try {
    const response = await fetch("/api/dashboard");
    if (!response.ok) throw new Error("Не удалось загрузить данные");
    const data = await response.json();

    document.getElementById("summary").textContent =
      `${data.summary.totalPortions} порций`;

    renderList(
      "incidents",
      data.incidents.map((i) => `[${i.status}] Кабинет ${i.room}: ${i.description}`)
    );

    renderList(
      "tasksList",
      data.tasks.map(
        (t) =>
          `${t.assignee}: ${t.title}${t.due ? ` (до ${t.due})` : ''}`
      )
    );

    renderList(
      "substitutionsList",
      data.substitutions.map(
        (s) =>
          `${s.className} ур.${s.lesson}: ${s.originalTeacher} → ${s.substituteTeacher || "не найден"}`
      )
    );

    document.getElementById("incidentsCount").textContent = data.incidents.length;
    document.getElementById("tasksCount").textContent = data.tasks.length;
    document.getElementById("subsCount").textContent = data.substitutions.length;
  } catch (error) {
    console.error("Dashboard fetch error:", error);
  }
}

async function loadTeachers() {
  const response = await fetch("/api/teachers");
  const data = await response.json();
  const namesList = document.getElementById("teacherNamesList");
  namesList.innerHTML = "";
  data.teachers.forEach((teacher) => {
    const listOption = document.createElement("option");
    listOption.value = teacher.name;
    namesList.appendChild(listOption);
  });
}

async function loadMiniSchedule() {
  const response = await fetch("/api/schedule/mini");
  const data = await response.json();
  miniSchedule = data.classes || [];
  const select = document.getElementById("classSelect");
  select.innerHTML = "";
  miniSchedule.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.className;
    option.textContent = entry.className;
    select.appendChild(option);
  });
  renderMiniSchedule();
}

function renderMiniSchedule() {
  const className = document.getElementById("classSelect").value;
  const target = miniSchedule.find((c) => c.className === className) || miniSchedule[0];
  const table = document.getElementById("miniScheduleTable");
  if (!target) {
    table.textContent = "Расписание недоступно.";
    return;
  }
  table.innerHTML = `
    <table>
      <thead><tr><th>Урок</th><th>Время</th><th>Предмет</th></tr></thead>
      <tbody>
        ${target.lessons.map((l) => `<tr><td>${l.lesson}</td><td>${l.time}</td><td>${l.subject}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

async function loadChatContacts() {
  const response = await fetch("/api/chat/contacts");
  const data = await response.json();
  chatContacts = (data.contacts || []).filter((c) => c.name !== "Director");

  renderChatContacts(chatContacts);
}

function renderChatContacts(contacts) {
  const container = document.getElementById("chatContacts");
  container.innerHTML = "";
  
  if (contacts.length === 0) {
    container.innerHTML = '<p style="padding: 16px; text-align: center; color: #718096;">Контакты не найдены</p>';
    return;
  }
  
  contacts.forEach((contact) => {
    const btn = document.createElement("button");
    btn.className = "chat-contact-btn";
    btn.textContent = `${contact.name} (${contact.subject || contact.role})`;
    btn.addEventListener("click", () => {
      activeContact = contact.name;
      document.getElementById("chatHeader").textContent = `Чат: ${contact.name}`;
      renderChatContacts(chatContacts);
      loadChatMessages();
    });
    btn.dataset.name = contact.name;
    
    if (contact.name === activeContact) {
      btn.classList.add("active");
    }
    
    container.appendChild(btn);
  });
}

// Search functionality
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById("chatSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      
      if (!query) {
        renderChatContacts(chatContacts);
        return;
      }
      
      const filtered = chatContacts.filter((contact) => {
        const name = contact.name.toLowerCase();
        const subject = (contact.subject || "").toLowerCase();
        const role = (contact.role || "").toLowerCase();
        return name.includes(query) || subject.includes(query) || role.includes(query);
      });
      
      renderChatContacts(filtered);
    });
  }
});

function formatTs(value) {
  const date = new Date(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadChatMessages() {
  const panel = document.getElementById("chatMessages");
  if (!activeContact) {
    panel.innerHTML = "";
    return;
  }
  const response = await fetch(`/api/chat/messages?with=${encodeURIComponent(activeContact)}`);
  const data = await response.json();
  const messages = data.messages || [];

  panel.innerHTML = "";
  messages.forEach((m) => {
    const item = document.createElement("div");
    const isMine = m.fromName === "Director";
    item.className = `chat-message ${isMine ? "mine" : "their"}`;

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = `${m.fromName} • ${formatTs(m.createdAt)}`;

    const body = document.createElement("div");
    body.className = "chat-body";
    body.textContent = m.text;

    item.appendChild(meta);
    item.appendChild(body);
    panel.appendChild(item);
  });
  panel.scrollTop = panel.scrollHeight;
}

function renderList(id, items) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";
  if (items.length === 0) {
    ul.innerHTML = '<li style="opacity: 0.6; border-left-color: #cbd5e0;">Нет данных</li>';
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });
}

let pendingTasks = [];
let allEmployees = [];
let recognition = null;
let isRecording = false;

// Initialize speech recognition
function initSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    document.getElementById('voiceBtn').style.display = 'none';
    document.getElementById('voiceStatus').textContent = 'Голосовой ввод не поддерживается в этом браузере';
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'ru-RU';
  
  recognition.onstart = () => {
    isRecording = true;
    const btn = document.getElementById('voiceBtn');
    const status = document.getElementById('voiceStatus');
    btn.classList.add('recording');
    btn.textContent = '⏹️ Остановить';
    status.textContent = '🎤 Говорите...';
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const textarea = document.getElementById('taskInput');
    
    if (textarea.value.trim()) {
      textarea.value += '\n' + transcript;
    } else {
      textarea.value = transcript;
    }
    
    document.getElementById('voiceStatus').textContent = `✅ Распознано: "${transcript}"`;
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    const status = document.getElementById('voiceStatus');
    
    switch(event.error) {
      case 'no-speech':
        status.textContent = '❌ Речь не обнаружена. Попробуйте ещё раз.';
        break;
      case 'audio-capture':
        status.textContent = '❌ Микрофон недоступен. Проверьте разрешения.';
        break;
      case 'not-allowed':
        status.textContent = '❌ Доступ к микрофону запрещён. Разрешите в настройках браузера.';
        break;
      default:
        status.textContent = `❌ Ошибка распознавания: ${event.error}`;
    }
    
    resetVoiceButton();
  };
  
  recognition.onend = () => {
    resetVoiceButton();
  };
}

function resetVoiceButton() {
  isRecording = false;
  const btn = document.getElementById('voiceBtn');
  btn.classList.remove('recording');
  btn.textContent = '🎤 Голосовой ввод';
}

function toggleVoiceRecording() {
  if (!recognition) {
    document.getElementById('voiceStatus').textContent = '❌ Голосовой ввод не поддерживается';
    return;
  }
  
  if (isRecording) {
    recognition.stop();
  } else {
    document.getElementById('voiceStatus').textContent = '';
    recognition.start();
  }
}

// Add event listener for voice button
document.addEventListener('DOMContentLoaded', () => {
  initSpeechRecognition();
  
  const voiceBtn = document.getElementById('voiceBtn');
  if (voiceBtn) {
    voiceBtn.addEventListener('click', toggleVoiceRecording);
  }
});

async function loadEmployees() {
  try {
    const response = await fetch("/api/teachers");
    const data = await response.json();
    allEmployees = data.teachers || [];
  } catch (error) {
    console.error("Failed to load employees:", error);
  }
}

async function createTasksFromText() {
  const text = document.getElementById("taskInput").value.trim();
  if (!text) return;
  
  const btn = document.getElementById("createTasksBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ Обработка...";
  
  try {
    const response = await fetch("/api/tasks/from-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Ошибка постановки задач");
      return;
    }
    
    const data = await response.json();
    pendingTasks = data.tasks || [];
    
    // Check if any tasks need confirmation
    const needsConfirmation = pendingTasks.some(task => {
      const employee = allEmployees.find(e => e.name === task.assignee);
      return !employee;
    });
    
    if (needsConfirmation) {
      showTaskConfirmation(pendingTasks);
    } else {
      document.getElementById("taskInput").value = "";
      await fetchDashboard();
      alert(`✅ Создано задач: ${pendingTasks.length}`);
    }
  } catch (error) {
    alert(`Ошибка сети: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function showTaskConfirmation(tasks) {
  const container = document.getElementById("taskConfirmation");
  container.innerHTML = "";
  container.style.display = "block";
  
  const title = document.createElement("h3");
  title.textContent = "🔍 Подтвердите исполнителей";
  title.style.marginBottom = "16px";
  container.appendChild(title);
  
  tasks.forEach((task, index) => {
    const taskCard = document.createElement("div");
    taskCard.className = "task-confirmation-card";
    
    const taskTitle = document.createElement("div");
    taskTitle.className = "task-confirmation-title";
    taskTitle.textContent = task.title;
    
    const taskDetails = document.createElement("div");
    taskDetails.className = "task-confirmation-details";
    taskDetails.textContent = task.details;
    
    const assigneeLabel = document.createElement("label");
    assigneeLabel.textContent = "Исполнитель:";
    assigneeLabel.style.display = "block";
    assigneeLabel.style.marginTop = "12px";
    assigneeLabel.style.fontWeight = "600";
    
    const assigneeSelect = document.createElement("select");
    assigneeSelect.id = `taskAssignee-${index}`;
    assigneeSelect.style.width = "100%";
    assigneeSelect.style.marginTop = "8px";
    
    // Check if assignee exists
    const employee = allEmployees.find(e => e.name === task.assignee);
    
    if (employee) {
      // Exact match found
      const option = document.createElement("option");
      option.value = employee.name;
      option.textContent = `${employee.name} (${employee.subject})`;
      assigneeSelect.appendChild(option);
      taskCard.style.borderLeft = "3px solid #48bb78";
    } else {
      // No match - show all employees
      const placeholderOption = document.createElement("option");
      placeholderOption.value = "";
      placeholderOption.textContent = `❓ "${task.assignee}" не найден - выберите из списка`;
      assigneeSelect.appendChild(placeholderOption);
      
      allEmployees.forEach(emp => {
        const option = document.createElement("option");
        option.value = emp.name;
        option.textContent = `${emp.name} (${emp.subject})`;
        assigneeSelect.appendChild(option);
      });
      
      taskCard.style.borderLeft = "3px solid #f59e0b";
    }
    
    taskCard.appendChild(taskTitle);
    taskCard.appendChild(taskDetails);
    taskCard.appendChild(assigneeLabel);
    taskCard.appendChild(assigneeSelect);
    container.appendChild(taskCard);
  });
  
  const buttonGroup = document.createElement("div");
  buttonGroup.style.display = "flex";
  buttonGroup.style.gap = "12px";
  buttonGroup.style.marginTop = "20px";
  
  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "✅ Подтвердить и создать";
  confirmBtn.addEventListener("click", () => confirmAndCreateTasks(tasks));
  
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "❌ Отмена";
  cancelBtn.style.background = "#718096";
  cancelBtn.addEventListener("click", () => {
    container.style.display = "none";
    container.innerHTML = "";
  });
  
  buttonGroup.appendChild(confirmBtn);
  buttonGroup.appendChild(cancelBtn);
  container.appendChild(buttonGroup);
}

async function confirmAndCreateTasks(tasks) {
  const updatedTasks = tasks.map((task, index) => {
    const select = document.getElementById(`taskAssignee-${index}`);
    return {
      ...task,
      assignee: select.value || task.assignee
    };
  });
  
  // Check if all tasks have assignees
  const missingAssignee = updatedTasks.find(t => !t.assignee);
  if (missingAssignee) {
    alert("Пожалуйста, выберите исполнителя для всех задач");
    return;
  }
  
  try {
    const response = await fetch("/api/tasks/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: updatedTasks }),
    });
    
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Ошибка создания задач");
      return;
    }
    
    document.getElementById("taskConfirmation").style.display = "none";
    document.getElementById("taskConfirmation").innerHTML = "";
    document.getElementById("taskInput").value = "";
    await fetchDashboard();
    alert(`✅ Создано задач: ${updatedTasks.length}`);
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
}

function renderSubstitutionSuggestions(suggestions) {
  const container = document.getElementById("substitutionSuggestions");
  container.innerHTML = "";
  if (!suggestions.length) {
    container.innerHTML = '<p style="color: #718096; padding: 16px; text-align: center;">Варианты не найдены</p>';
    return;
  }

  suggestions.forEach((s, index) => {
    const row = document.createElement("div");
    row.className = "suggestion-row";
    const title = document.createElement("div");
    title.textContent = `${s.className} • Урок ${s.lesson} • ${s.time || "время не указано"} • ${s.subject} • Каб. ${s.room}`;
    title.style.fontWeight = "600";
    title.style.marginBottom = "10px";

    const select = document.createElement("select");
    select.id = `candidateSelect-${index}`;
    const autoOption = document.createElement("option");
    autoOption.value = s.substituteTeacher || "";
    autoOption.textContent = `✨ Авто: ${s.substituteTeacher || "не найдено"}`;
    select.appendChild(autoOption);

    s.candidateTeachers.forEach((teacher) => {
      const option = document.createElement("option");
      option.value = teacher;
      option.textContent = teacher;
      select.appendChild(option);
    });

    row.appendChild(title);
    row.appendChild(select);
    container.appendChild(row);
  });

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "✅ Применить замену";
  applyBtn.style.marginTop = "16px";
  applyBtn.addEventListener("click", applySubstitutionSelections);
  container.appendChild(applyBtn);
}

async function previewSubstitution() {
  const teacherName = document.getElementById("sickTeacher").value.trim();
  const date = document.getElementById("substituteDate").value;
  const statusEl = document.getElementById("substitutionStatus");
  if (!teacherName) {
    statusEl.textContent = "Введите ФИО учителя";
    return;
  }
  
  const btn = document.getElementById("substitutePreviewBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ Загрузка...";
  
  try {
    const response = await fetch("/api/substitutions/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherName, date }),
    });
    
    if (!response.ok) {
      let errorMsg = "не удалось получить варианты";
      try {
        const data = await response.json();
        errorMsg = data.error || errorMsg;
      } catch (e) {
        // Response is not JSON
      }
      statusEl.textContent = `Ошибка: ${errorMsg}`;
      return;
    }
    
    const data = await response.json();
    currentSuggestions = data.suggestions || [];
    if (currentSuggestions.length === 0 && data.message) statusEl.textContent = data.message;
    renderSubstitutionSuggestions(currentSuggestions);
    statusEl.textContent = `Найдено вариантов: ${currentSuggestions.length}`;
  } catch (error) {
    statusEl.textContent = `Ошибка сети: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function applySubstitutionSelections() {
  const teacherName = document.getElementById("sickTeacher").value.trim();
  const date = document.getElementById("substituteDate").value;
  const statusEl = document.getElementById("substitutionStatus");
  const selections = {};
  currentSuggestions.forEach((s, index) => {
    const select = document.getElementById(`candidateSelect-${index}`);
    const lessonKey = `${s.className}-${s.lesson}`;
    if (select && select.value) selections[lessonKey] = select.value;
  });

  const applyBtn = event.target;
  const originalText = applyBtn.textContent;
  applyBtn.disabled = true;
  applyBtn.textContent = "⏳ Применение...";
  
  try {
    const response = await fetch("/api/substitutions/sick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherName, date, selections }),
    });
    const data = await response.json();
    if (!response.ok) {
      statusEl.textContent = `Ошибка: ${data.error || "не удалось применить замену"}`;
      return;
    }
    statusEl.textContent = `✅ Замены применены: ${(data.substitutions || []).length}`;
    currentSuggestions = [];
    document.getElementById("substitutionSuggestions").innerHTML = "";
    document.getElementById("sickTeacher").value = "";
    await fetchDashboard();
  } catch (error) {
    statusEl.textContent = `Ошибка сети: ${error.message}`;
  } finally {
    applyBtn.disabled = false;
    applyBtn.textContent = originalText;
  }
}

async function sendChatMessage() {
  const statusEl = document.getElementById("chatStatus");
  const messageEl = document.getElementById("chatInput");
  const message = messageEl.value.trim();
  if (!activeContact) {
    statusEl.textContent = "Сначала выберите контакт.";
    return;
  }
  if (!message) {
    statusEl.textContent = "Введите сообщение.";
    return;
  }
  
  const btn = document.getElementById("chatSendBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳";
  
  try {
    const response = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toName: activeContact, message }),
    });
    const data = await response.json();
    if (!response.ok) {
      statusEl.textContent = `Ошибка: ${data.error || "не удалось отправить сообщение"}`;
      return;
    }
    statusEl.textContent = `✅ Отправлено: ${activeContact}`;
    messageEl.value = "";
    await loadChatMessages();
  } catch (error) {
    statusEl.textContent = `Ошибка сети: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function simplifyOrder() {
  const orderText = document.getElementById("orderInput").value.trim();
  if (!orderText) {
    document.getElementById("orderStatus").textContent = "Введите текст приказа";
    return;
  }
  
  const btn = document.getElementById("simplifyOrderBtn");
  const statusEl = document.getElementById("orderStatus");
  const outputEl = document.getElementById("orderOutput");
  const originalText = btn.textContent;
  
  btn.disabled = true;
  btn.textContent = "⏳ Обработка...";
  statusEl.textContent = "";
  outputEl.innerHTML = "";
  
  try {
    const response = await fetch("/api/orders/simplify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderText }),
    });
    const data = await response.json();
    if (!response.ok) {
      statusEl.textContent = `Ошибка: ${data.error || "не удалось упростить приказ"}`;
      return;
    }
    
    outputEl.innerHTML = `<div class="order-result">${data.simplified.replace(/\n/g, "<br>")}</div>`;
    statusEl.textContent = "✅ Приказ упрощён";
  } catch (error) {
    statusEl.textContent = `Ошибка сети: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById("createTasksBtn").addEventListener("click", createTasksFromText);
document.getElementById("substitutePreviewBtn").addEventListener("click", previewSubstitution);
document.getElementById("chatSendBtn").addEventListener("click", sendChatMessage);
document.getElementById("simplifyOrderBtn").addEventListener("click", simplifyOrder);
document.getElementById("classSelect").addEventListener("change", renderMiniSchedule);

// Page navigation
function showPage(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Show selected page
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  
  // Update nav active state
  document.querySelectorAll('.nav a').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${pageId}`) {
      link.classList.add('active');
    }
  });
  
  // Update URL hash without scrolling
  history.pushState(null, null, `#${pageId}`);
}

// Navigation click handlers
document.querySelectorAll('.nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const pageId = link.getAttribute('href').substring(1);
    showPage(pageId);
  });
});

// Handle browser back/forward
window.addEventListener('hashchange', () => {
  const pageId = window.location.hash.substring(1) || 'overview';
  showPage(pageId);
});

// Show initial page based on URL hash
const initialPage = window.location.hash.substring(1) || 'overview';
showPage(initialPage);

fetchDashboard();
loadTeachers();
loadEmployees();
loadChatContacts();
loadMiniSchedule();
document.getElementById("substituteDate").valueAsDate = new Date();
setInterval(fetchDashboard, 10000);
setInterval(loadChatMessages, 5000);
