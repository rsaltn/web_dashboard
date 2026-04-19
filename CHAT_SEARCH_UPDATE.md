# 🔍 Обновление: Поиск в чате

## Что добавлено

### Поле поиска
- Расположено над списком контактов
- Поиск в реальном времени (без кнопки)
- Поиск по имени, предмету и роли

### Как работает
1. Введите текст в поле поиска
2. Список контактов фильтруется автоматически
3. Очистите поле для показа всех контактов

---

## Исправления

### 1. Ошибка JSON
**Было:** "Unexpected end of JSON input"
**Причина:** Сервер возвращал не-JSON при ошибке
**Исправлено:** Добавлена обработка не-JSON ответов

```javascript
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
```

### 2. Поиск в чате
**Добавлено:**
- Поле ввода для поиска
- Фильтрация контактов в реальном времени
- Поиск по имени, предмету, роли

---

## Структура

### HTML
```html
<div class="chat-sidebar">
  <div class="chat-search">
    <input type="text" id="chatSearch" placeholder="🔍 Поиск учителя..." />
  </div>
  <div class="chat-contacts" id="chatContacts"></div>
</div>
```

### CSS
```css
.chat-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-search {
  background: #ffffff;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 8px;
}
```

### JavaScript
```javascript
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  
  const filtered = chatContacts.filter((contact) => {
    const name = contact.name.toLowerCase();
    const subject = (contact.subject || "").toLowerCase();
    const role = (contact.role || "").toLowerCase();
    return name.includes(query) || subject.includes(query) || role.includes(query);
  });
  
  renderChatContacts(filtered);
});
```

---

## Примеры поиска

### По имени:
- Введите: "Eldos" → найдёт "Eldos Seitsamuly"
- Введите: "Sholpan" → найдёт "Sholpan Shaymuratova"

### По предмету:
- Введите: "English" → найдёт всех учителей английского
- Введите: "ICT" → найдёт учителей информатики

### По роли:
- Введите: "teacher" → найдёт всех учителей
- Введите: "director" → найдёт директора

---

## Особенности

### Регистронезависимый поиск
- "eldos" = "Eldos" = "ELDOS"

### Поиск по частичному совпадению
- "Eld" найдёт "Eldos"
- "Eng" найдёт "English"

### Пустое состояние
- Если ничего не найдено: "Контакты не найдены"
- Если поле пустое: показываются все контакты

---

## Запуск

```bash
npm run dev
```

Откройте: **http://localhost:3000/#chat**

Теперь можно искать учителей в чате! 🔍
