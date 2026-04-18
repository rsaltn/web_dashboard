const TelegramBot = require("node-telegram-bot-api");
const { telegramBotToken, directorChatId } = require("../config");
const { appendRecord, readJson, writeJson } = require("../store");
const { parseAttendanceMessage, parseIncidentMessage, buildMealSummary } = require("./parser");

function createTelegramService() {
  if (!telegramBotToken) {
    return { bot: null };
  }

  const bot = new TelegramBot(telegramBotToken, { polling: true });
  const menuKeyboard = {
    reply_markup: {
      keyboard: [
        [{ text: "📌 Меню" }, { text: "👤 Кто я" }],
        [{ text: "🆔 Мой Chat ID" }],
        [{ text: "🍽 Свод питания" }, { text: "🧑‍🏫 Список учителей" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };

  async function safeSendMessage(chatId, text) {
    if (!chatId) return;
    try {
      await bot.sendMessage(chatId, text);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Telegram send failed:", error?.response?.body || error.message);
    }
  }

  bot.on("message", async (msg) => {
    if (!msg.text) return;

    const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Unknown";
    const chatId = String(msg.chat.id);
    const text = msg.text.trim();

    const employees = readJson("employees.json", []);
    const senderEmployee = employees.find((e) => String(e.telegramChatId) === chatId);
    const isDirector =
      (directorChatId && chatId === String(directorChatId)) ||
      (senderEmployee && senderEmployee.role === "director");
    const senderName = senderEmployee?.name || fromName;

    if (text === "/start") {
      try {
        await bot.setMyCommands([
          { command: "start", description: "Запустить бота и открыть меню" },
          { command: "menu", description: "Показать список действий" },
          { command: "register", description: "Привязать чат: /register ФИО" },
          { command: "whoami", description: "Показать мой профиль" },
          { command: "chatid", description: "Показать текущий Chat ID" },
          { command: "summary", description: "Свод по питанию за сегодня" },
          { command: "teachers", description: "Список учителей (для директора)" },
          { command: "sendto", description: "Личное сообщение: /sendto ФИО | текст" },
          { command: "broadcast", description: "Рассылка: /broadcast текст" },
          { command: "director", description: "Написать директору: /director текст" },
        ]);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("setMyCommands failed:", error?.response?.body || error.message);
      }
      await safeSendMessage(
        chatId,
        "AI Завуч бот активен.\nКоманды:\n/register ФИО\n/whoami\n/summary\n/teachers\n/sendto ФИО | сообщение\n/broadcast сообщение\n/director сообщение"
      );
      try {
        await bot.sendMessage(chatId, "Выберите действие из меню ниже 👇", menuKeyboard);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("menu keyboard send failed:", error?.response?.body || error.message);
      }
      return;
    }

    if (text === "/menu" || text === "📌 Меню") {
      const menuText = isDirector
        ? "Действия:\n- /register ФИО\n- /whoami\n- /chatid\n- /summary\n- /teachers\n- /sendto ФИО | сообщение\n- /broadcast сообщение"
        : "Действия:\n- /register ФИО\n- /whoami\n- /chatid\n- /summary\n- /director сообщение";
      await safeSendMessage(chatId, menuText);
      try {
        await bot.sendMessage(chatId, "Быстрые кнопки обновлены 👇", menuKeyboard);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("menu keyboard refresh failed:", error?.response?.body || error.message);
      }
      return;
    }

    if (text === "👤 Кто я") {
      const employee = employees.find((e) => String(e.telegramChatId) === chatId);
      if (!employee) {
        await safeSendMessage(chatId, "Чат пока не привязан. Используйте: /register ФИО");
      } else {
        await safeSendMessage(chatId, `Вы: ${employee.name} (${employee.role}${employee.subject ? `, ${employee.subject}` : ""})`);
      }
      return;
    }

    if (text === "/chatid" || text === "🆔 Мой Chat ID") {
      await safeSendMessage(chatId, `Ваш Chat ID: ${chatId}`);
      return;
    }

    if (text === "🍽 Свод питания") {
      const today = new Date().toISOString().slice(0, 10);
      const attendanceToday = readJson("attendance_records.json", []).filter((r) =>
        r.createdAt.startsWith(today)
      );
      const summary = buildMealSummary(attendanceToday);
      const payload = `Свод питания\nПорции: ${summary.totalPortions}\nОтсутствуют: ${summary.totalAbsent}\nКлассов: ${summary.classesCounted}`;
      await safeSendMessage(chatId, payload);
      return;
    }

    if (text === "🧑‍🏫 Список учителей") {
      if (!isDirector) {
        await safeSendMessage(chatId, "Команда доступна только директору.");
        return;
      }
      const teachers = employees.filter((e) => e.role === "teacher");
      const rows = teachers.map((t) => `- ${t.name} (${t.subject}) ${t.telegramChatId ? "✅" : "❌"}`);
      await safeSendMessage(chatId, `Учителя:\n${rows.join("\n")}`);
      return;
    }

    if (text.startsWith("/register ")) {
      const fullName = text.replace("/register ", "").trim();
      const employeeIndex = employees.findIndex((e) => e.name.toLowerCase() === fullName.toLowerCase());
      if (employeeIndex === -1) {
        await safeSendMessage(chatId, `Сотрудник не найден: ${fullName}`);
        return;
      }
      employees[employeeIndex].telegramChatId = chatId;
      writeJson("employees.json", employees);
      await safeSendMessage(chatId, `Готово, чат привязан к сотруднику: ${employees[employeeIndex].name}`);
      return;
    }

    if (text === "/whoami") {
      const employee = employees.find((e) => String(e.telegramChatId) === chatId);
      if (!employee) {
        await safeSendMessage(chatId, "Чат пока не привязан. Используйте: /register ФИО");
      } else {
        await safeSendMessage(chatId, `Вы: ${employee.name} (${employee.role}${employee.subject ? `, ${employee.subject}` : ""})`);
      }
      return;
    }

    if (text === "/teachers") {
      if (!isDirector) {
        await safeSendMessage(chatId, "Команда доступна только директору.");
        return;
      }
      const teachers = employees.filter((e) => e.role === "teacher");
      const rows = teachers.map(
        (t) => `- ${t.name} (${t.subject}) ${t.telegramChatId ? "✅" : "❌"}`
      );
      await safeSendMessage(chatId, `Учителя:\n${rows.join("\n")}`);
      return;
    }

    if (text.startsWith("/sendto ")) {
      if (!isDirector) {
        await safeSendMessage(chatId, "Команда доступна только директору.");
        return;
      }
      const payload = text.replace("/sendto ", "").trim();
      const separatorIndex = payload.indexOf("|");
      if (separatorIndex === -1) {
        await safeSendMessage(chatId, "Формат: /sendto ФИО | сообщение");
        return;
      }

      const teacherName = payload.slice(0, separatorIndex).trim();
      const message = payload.slice(separatorIndex + 1).trim();
      const teacher = employees.find(
        (e) => e.role === "teacher" && e.name.toLowerCase() === teacherName.toLowerCase()
      );
      if (!teacher) {
        await safeSendMessage(chatId, `Учитель не найден: ${teacherName}`);
        return;
      }
      if (!teacher.telegramChatId) {
        await safeSendMessage(chatId, `У учителя нет регистрации в боте: ${teacher.name}`);
        return;
      }

      await safeSendMessage(teacher.telegramChatId, `Сообщение от директора:\n${message}`);
      await safeSendMessage(chatId, `Отправлено: ${teacher.name}`);
      return;
    }

    if (text.startsWith("/broadcast ")) {
      if (!isDirector) {
        await safeSendMessage(chatId, "Команда доступна только директору.");
        return;
      }
      const message = text.replace("/broadcast ", "").trim();
      if (!message) {
        await safeSendMessage(chatId, "Формат: /broadcast сообщение");
        return;
      }
      const recipients = employees.filter((e) => e.role === "teacher" && e.telegramChatId);
      for (const teacher of recipients) {
        await safeSendMessage(teacher.telegramChatId, `Сообщение от директора:\n${message}`);
      }
      await safeSendMessage(chatId, `Отправлено учителям: ${recipients.length}`);
      return;
    }

    if (text.startsWith("/director ")) {
      const messageToDirector = text.replace("/director ", "").trim();
      if (!messageToDirector) {
        await safeSendMessage(chatId, "Формат: /director ваше сообщение");
        return;
      }
      if (!directorChatId) {
        await safeSendMessage(chatId, "Чат директора не настроен.");
        return;
      }
      await safeSendMessage(
        directorChatId,
        `Сообщение учителя: ${senderName}\n${messageToDirector}`
      );
      appendRecord("messages.json", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        direction: "inbound",
        channel: "telegram",
        fromName: senderName,
        fromRole: senderEmployee?.role || "teacher",
        fromChatId: chatId,
        toName: "Director",
        toRole: "director",
        toChatId: String(directorChatId),
        text: messageToDirector,
      });
      await safeSendMessage(chatId, "Сообщение отправлено директору.");
      return;
    }

    const attendance = parseAttendanceMessage(text);
    if (attendance) {
      appendRecord("attendance_records.json", {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        chatId,
        from: fromName,
        ...attendance,
      });
    }

    const incident = parseIncidentMessage(text);
    if (incident) {
      appendRecord("incidents.json", {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        chatId,
        from: fromName,
        status: "new",
        ...incident,
      });
    }

    if (text === "/summary") {
      const today = new Date().toISOString().slice(0, 10);
      const attendanceToday = readJson("attendance_records.json", []).filter((r) =>
        r.createdAt.startsWith(today)
      );
      const summary = buildMealSummary(attendanceToday);
      const payload = `Свод питания\nПорции: ${summary.totalPortions}\nОтсутствуют: ${summary.totalAbsent}\nКлассов: ${summary.classesCounted}`;
      await safeSendMessage(chatId, payload);
      return;
    }

    if (directorChatId && chatId === String(directorChatId) && text.startsWith("/help")) {
      await safeSendMessage(
        chatId,
        "Команды: /whoami, /chatid, /summary, /teachers, /sendto ФИО | сообщение, /broadcast сообщение, /director сообщение"
      );
      return;
    }

    if (!text.startsWith("/") && senderEmployee?.role === "teacher" && !attendance && !incident) {
      if (!directorChatId) {
        await safeSendMessage(chatId, "Чат директора не настроен.");
        return;
      }
      await safeSendMessage(
        directorChatId,
        `Сообщение учителя: ${senderName}\n${text}`
      );
      appendRecord("messages.json", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        direction: "inbound",
        channel: "telegram",
        fromName: senderName,
        fromRole: senderEmployee.role,
        fromChatId: chatId,
        toName: "Director",
        toRole: "director",
        toChatId: String(directorChatId),
        text,
      });
      await safeSendMessage(chatId, "Сообщение отправлено директору.");
    }
  });

  return { bot };
}

module.exports = { createTelegramService };
