let currentSuggestions = [];
let chatContacts = [];
let activeContact = "";
let miniSchedule = [];

async function fetchDashboard() {
  const response = await fetch("/api/dashboard");
  const data = await response.json();

  document.getElementById("summary").textContent =
    `Порций: ${data.summary.totalPortions} | Отсутствуют: ${data.summary.totalAbsent} | Классов: ${data.summary.classesCounted}`;

  renderList(
    "incidents",
    data.incidents.map((i) => `[${i.status}] Кабинет ${i.room}: ${i.description}`)
  );

  renderList(
    "tasksList",
    data.tasks.map(
      (t) =>
        `${t.assignee}: ${t.title} (${t.due || "без срока"}) [risk: ${t.complianceRisk?.risk || "n/a"}]`
    )
  );

  renderList(
    "substitutionsList",
    data.substitutions.map(
      (s) =>
        `${s.className} ур.${s.lesson}: ${s.originalTeacher} -> ${s.substituteTeacher || "не найден"}`
    )
  );

  document.getElementById("incidentsCount").textContent = data.incidents.length;
  document.getElementById("tasksCount").textContent = data.tasks.length;
  document.getElementById("subsCount").textContent = data.substitutions.length;
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

  const container = document.getElementById("chatContacts");
  container.innerHTML = "";
  chatContacts.forEach((contact) => {
    const btn = document.createElement("button");
    btn.className = "chat-contact-btn";
    btn.textContent = `${contact.name} (${contact.subject || contact.role})`;
    btn.addEventListener("click", () => {
      activeContact = contact.name;
      document.getElementById("chatHeader").textContent = `Чат: ${contact.name}`;
      renderContacts();
      loadChatMessages();
    });
    btn.dataset.name = contact.name;
    container.appendChild(btn);
  });

  renderContacts();
}

function renderContacts() {
  const buttons = document.querySelectorAll(".chat-contact-btn");
  buttons.forEach((btn) => {
    if (btn.dataset.name === activeContact) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

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
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });
}

async function createTasksFromText() {
  const text = document.getElementById("taskInput").value.trim();
  if (!text) return;
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
  document.getElementById("taskInput").value = "";
  await fetchDashboard();
}

function renderSubstitutionSuggestions(suggestions) {
  const container = document.getElementById("substitutionSuggestions");
  container.innerHTML = "";
  if (!suggestions.length) {
    container.textContent = "Варианты не найдены.";
    return;
  }

  suggestions.forEach((s, index) => {
    const row = document.createElement("div");
    row.className = "suggestion-row";
    const title = document.createElement("div");
    title.textContent = `${s.className} ур.${s.lesson} (${s.time || "время не указано"}) ${s.subject}, каб. ${s.room}`;

    const select = document.createElement("select");
    select.id = `candidateSelect-${index}`;
    const autoOption = document.createElement("option");
    autoOption.value = s.substituteTeacher || "";
    autoOption.textContent = `Авто: ${s.substituteTeacher || "не найдено"}`;
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
  applyBtn.textContent = "Применить замену";
  applyBtn.addEventListener("click", applySubstitutionSelections);
  container.appendChild(applyBtn);
}

async function previewSubstitution() {
  const teacherName = document.getElementById("sickTeacher").value.trim();
  const date = document.getElementById("substituteDate").value;
  const statusEl = document.getElementById("substitutionStatus");
  if (!teacherName) return;
  const response = await fetch("/api/substitutions/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherName, date }),
  });
  const data = await response.json();
  if (!response.ok) {
    statusEl.textContent = `Ошибка: ${data.error || "не удалось получить варианты"}`;
    return;
  }
  currentSuggestions = data.suggestions || [];
  if (currentSuggestions.length === 0 && data.message) statusEl.textContent = data.message;
  renderSubstitutionSuggestions(currentSuggestions);
  statusEl.textContent = `Найдено вариантов: ${currentSuggestions.length}`;
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
  statusEl.textContent = `Замены применены: ${(data.substitutions || []).length}`;
  currentSuggestions = [];
  document.getElementById("substitutionSuggestions").innerHTML = "";
  document.getElementById("sickTeacher").value = "";
  await fetchDashboard();
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
  statusEl.textContent = `Отправлено: ${activeContact}`;
  messageEl.value = "";
  await loadChatMessages();
}

document.getElementById("createTasksBtn").addEventListener("click", createTasksFromText);
document.getElementById("substitutePreviewBtn").addEventListener("click", previewSubstitution);
document.getElementById("chatSendBtn").addEventListener("click", sendChatMessage);
document.getElementById("classSelect").addEventListener("change", renderMiniSchedule);
document.getElementById("focusAttendanceBtn").addEventListener("click", () => document.getElementById("overview").scrollIntoView({ behavior: "smooth" }));
document.getElementById("focusTasksBtn").addEventListener("click", () => document.getElementById("tasks").scrollIntoView({ behavior: "smooth" }));
document.getElementById("focusSubBtn").addEventListener("click", () => document.getElementById("substitutions").scrollIntoView({ behavior: "smooth" }));

fetchDashboard();
loadTeachers();
loadChatContacts();
loadMiniSchedule();
document.getElementById("substituteDate").valueAsDate = new Date();
setInterval(fetchDashboard, 10000);
setInterval(loadChatMessages, 5000);
