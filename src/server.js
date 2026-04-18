const express = require("express");
const cors = require("cors");
const path = require("path");
const { port } = require("./config");
const { appendRecord, readJson } = require("./store");
const { parseDirectorTasks, simplifyOrder, detectComplianceRisk } = require("./services/gemini");
const { buildMealSummary } = require("./services/parser");
const { buildSubstitutionPlan } = require("./services/substitution");
const { createTelegramService } = require("./services/telegram");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

const { bot } = createTelegramService();

function notifyTelegram(chatId, message) {
  if (!bot || !chatId) return Promise.resolve();
  return bot.sendMessage(chatId, message).catch((error) => {
    // eslint-disable-next-line no-console
    console.warn("Telegram notify failed:", error?.response?.body || error.message);
  });
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveAssigneeName(rawAssignee, employees) {
  if (!rawAssignee) return null;
  const direct = employees.find((e) => normalize(e.name) === normalize(rawAssignee));
  if (direct) return direct.name;
  const partial = employees.find(
    (e) =>
      normalize(e.name).includes(normalize(rawAssignee)) ||
      normalize(rawAssignee).includes(normalize(e.name))
  );
  return partial ? partial.name : rawAssignee;
}

function generateMiniSchedule() {
  const classes = [];
  for (let grade = 1; grade <= 11; grade += 1) {
    ["A", "B", "C"].forEach((parallel) => classes.push(`${grade}${parallel}`));
  }
  const slots = [
    { lesson: 1, time: "08:30-09:15" },
    { lesson: 2, time: "09:25-10:10" },
    { lesson: 3, time: "10:20-11:05" },
    { lesson: 4, time: "11:20-12:05" },
    { lesson: 5, time: "12:15-13:00" },
  ];
  const subjectsByGrade = {
    junior: ["Math", "Reading", "English", "Science", "Art"],
    middle: ["Algebra", "English", "Biology", "History", "ICT"],
    senior: ["Algebra", "English", "Physics", "Chemistry", "ICT"],
  };
  return classes.map((className) => {
    const grade = Number(className.slice(0, -1));
    const bucket = grade <= 4 ? "junior" : grade <= 8 ? "middle" : "senior";
    return {
      className,
      lessons: slots.map((slot, index) => ({
        ...slot,
        subject: subjectsByGrade[bucket][index],
      })),
    };
  });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ai-zavuch-dashboard" });
});

app.get("/api/dashboard", (req, res) => {
  const attendance = readJson("attendance_records.json", []);
  const incidents = readJson("incidents.json", []);
  const tasks = readJson("tasks.json", []);
  const substitutions = readJson("substitutions.json", []);

  const today = new Date().toISOString().slice(0, 10);
  const attendanceToday = attendance.filter((x) => x.createdAt.startsWith(today));
  res.json({
    summary: buildMealSummary(attendanceToday),
    incidents: incidents.slice(-20).reverse(),
    tasks: tasks.slice(-20).reverse(),
    substitutions: substitutions.slice(-20).reverse(),
  });
});

app.get("/api/teachers", (req, res) => {
  const employees = readJson("employees.json", []);
  const teachers = employees
    .filter((e) => e.role === "teacher")
    .map((e) => ({
      id: e.id,
      name: e.name,
      subject: e.subject,
      telegramRegistered: Boolean(e.telegramChatId),
    }));
  res.json({ teachers });
});

app.get("/api/schedule/mini", (req, res) => {
  res.json({ classes: generateMiniSchedule() });
});

app.get("/api/chat/contacts", (req, res) => {
  const employees = readJson("employees.json", []);
  const teachers = employees
    .filter((e) => e.role === "teacher")
    .map((e) => ({
      name: e.name,
      subject: e.subject,
      role: e.role,
      telegramRegistered: Boolean(e.telegramChatId),
    }));
  res.json({ contacts: [{ name: "Director", role: "director" }, ...teachers] });
});

app.get("/api/chat/messages", (req, res) => {
  const withUser = req.query.with;
  const messages = readJson("messages.json", [])
    .filter((m) => !String(m.text || "").startsWith("/"))
    .filter((m) => {
      if (!withUser || withUser === "Director") return true;
      return m.fromName === withUser || m.toName === withUser;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  res.json({ messages });
});

app.post("/api/tasks/from-text", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    const employees = readJson("employees.json", []);
    const orders = readJson("orders.json", []);
    const parsedTasks = await parseDirectorTasks(text, employees);

    const saved = [];
    for (const task of parsedTasks) {
      const risk = await detectComplianceRisk(`${task.title}. ${task.details || ""}`, orders);
      const resolvedAssignee = resolveAssigneeName(task.assignee, employees);
      const employee = employees.find((e) => e.name === resolvedAssignee);
      const record = appendRecord("tasks.json", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        status: "new",
        ...task,
        assignee: resolvedAssignee,
        complianceRisk: risk,
      });
      saved.push(record);
      if (employee?.telegramChatId) {
        await notifyTelegram(
          employee.telegramChatId,
          `Новая задача: ${task.title}\nСрок: ${task.due || "не указан"}\nДетали: ${task.details || "-"}`
        );
      }
    }
    res.json({ tasks: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/substitutions/sick", async (req, res) => {
  try {
    const { teacherName, date, selections } = req.body;
    if (!teacherName) return res.status(400).json({ error: "teacherName is required" });
    const schedule = readJson("schedule.json", []);
    const employees = readJson("employees.json", []);
    const suggestions = buildSubstitutionPlan({ teacherName, dateString: date, schedule, employees });
    const selectedByLesson = selections || {};

    if (suggestions.length === 0) {
      return res.json({ substitutions: [], message: "На выбранный день уроков не найдено." });
    }

    const saved = [];
    for (const entry of suggestions) {
      const lessonKey = `${entry.className}-${entry.lesson}`;
      const pickedTeacherName = selectedByLesson[lessonKey] || entry.substituteTeacher;
      const record = appendRecord("substitutions.json", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        ...entry,
        substituteTeacher: pickedTeacherName,
      });
      saved.push(record);

      const original = employees.find((e) => normalize(e.name) === normalize(entry.originalTeacher));
      if (original?.telegramChatId) {
        await notifyTelegram(
          original.telegramChatId,
          `Вы успешно заменены на уроке ${entry.lesson} (${entry.time || "время не указано"}), ${entry.className}, кабинет ${entry.room}.`
        );
      }

      if (pickedTeacherName) {
        const substitute = employees.find((e) => normalize(e.name) === normalize(pickedTeacherName));
        if (substitute?.telegramChatId) {
          await notifyTelegram(
            substitute.telegramChatId,
            `Вам назначена замена: ${entry.className}, урок ${entry.lesson} (${entry.time || "время не указано"}), предмет ${entry.subject}, кабинет ${entry.room}.`
          );
        }
      }
    }
    res.json({ substitutions: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/substitutions/preview", (req, res) => {
  try {
    const { teacherName, date } = req.body;
    if (!teacherName) return res.status(400).json({ error: "teacherName is required" });
    const schedule = readJson("schedule.json", []);
    const employees = readJson("employees.json", []);
    const suggestions = buildSubstitutionPlan({ teacherName, dateString: date, schedule, employees });
    const message =
      suggestions.length === 0 ? "У выбранного учителя нет уроков в расписании." : "";
    res.json({ suggestions, message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/orders/simplify", async (req, res) => {
  try {
    const { orderText } = req.body;
    if (!orderText) return res.status(400).json({ error: "orderText is required" });
    const simplified = await simplifyOrder(orderText);
    res.json({ simplified });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/messages/send", async (req, res) => {
  try {
    const { teacherName, message } = req.body;
    if (!teacherName || !message) {
      return res.status(400).json({ error: "teacherName and message are required" });
    }

    const employees = readJson("employees.json", []);
    const teacher = employees.find(
      (e) => e.role === "teacher" && e.name.toLowerCase() === teacherName.toLowerCase()
    );
    if (!teacher) {
      return res.status(404).json({ error: `Teacher not found: ${teacherName}` });
    }
    if (!teacher.telegramChatId) {
      return res.status(400).json({ error: `Teacher is not registered: ${teacher.name}` });
    }

    await notifyTelegram(teacher.telegramChatId, `Сообщение от директора:\n${message}`);
    appendRecord("messages.json", {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      direction: "outbound",
      channel: "dashboard",
      fromName: "Director",
      fromRole: "director",
      toName: teacher.name,
      toRole: "teacher",
      toChatId: teacher.telegramChatId,
      text: message,
    });
    res.json({ ok: true, sentTo: teacher.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/messages/broadcast", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    const employees = readJson("employees.json", []);
    const recipients = employees.filter((e) => e.role === "teacher" && e.telegramChatId);
    for (const teacher of recipients) {
      await notifyTelegram(teacher.telegramChatId, `Сообщение от директора:\n${message}`);
      appendRecord("messages.json", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        direction: "outbound",
        channel: "dashboard",
        fromName: "Director",
        fromRole: "director",
        toName: teacher.name,
        toRole: "teacher",
        toChatId: teacher.telegramChatId,
        text: message,
      });
    }

    res.json({ ok: true, sentCount: recipients.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/send", async (req, res) => {
  try {
    const { toName, message } = req.body;
    if (!toName || !message) return res.status(400).json({ error: "toName and message are required" });

    const employees = readJson("employees.json", []);
    const recipient = employees.find((e) => e.name.toLowerCase() === toName.toLowerCase());
    if (!recipient) return res.status(404).json({ error: `Recipient not found: ${toName}` });
    if (!recipient.telegramChatId) return res.status(400).json({ error: `${recipient.name} is not registered` });

    await notifyTelegram(recipient.telegramChatId, `Сообщение от директора:\n${message}`);
    const saved = appendRecord("messages.json", {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      direction: "outbound",
      channel: "dashboard",
      fromName: "Director",
      fromRole: "director",
      toName: recipient.name,
      toRole: recipient.role,
      toChatId: recipient.telegramChatId,
      text: message,
    });

    res.json({ ok: true, message: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is running on http://localhost:${port}`);
});
