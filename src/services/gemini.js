const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiApiKey } = require("../config");

const modelName = "gemini-1.5-flash";
const client = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

async function askGemini(prompt) {
  if (!client) {
    throw new Error("GEMINI_API_KEY is missing");
  }
  const model = client.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function parseDirectorTasks(text, employees) {
  const prompt = `
Ты AI-ассистент директора школы. Разбей поручение на задачи.
Ответь строго JSON-массивом вида:
[{"assignee":"ФИО","title":"...","due":"YYYY-MM-DD","details":"..."}]

Список сотрудников:
${employees.map((e) => `- ${e.name} (${e.role}, ${e.subject || "без предмета"})`).join("\n")}

Поручение:
${text}
`;
  try {
    const raw = await askGemini(prompt);
    const normalized = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (error) {
    // fall through to local parser
  }
  return parseDirectorTasksFallback(text, employees);
}

function parseDirectorTasksFallback(text, employees) {
  const chunks = text
    .split(/\n|;/)
    .map((x) => x.trim())
    .filter(Boolean);

  const results = [];
  for (const chunk of chunks) {
    const matched = employees.find((e) => chunk.toLowerCase().includes(e.name.toLowerCase()));
    const [maybeAssignee, ...rest] = chunk.split(",");
    const details = rest.join(",").trim() || chunk;
    const title = details.split(".")[0].trim() || "Новая задача";
    results.push({
      assignee: matched?.name || maybeAssignee.trim(),
      title,
      due: "",
      details,
    });
  }
  return results;
}

async function simplifyOrder(orderText) {
  const prompt = `
Упрости текст приказа для учителей в понятный чек-лист.
Ответь коротким списком пунктов на русском языке.

Текст:
${orderText}
`;
  return askGemini(prompt);
}

async function detectComplianceRisk(taskText, orders) {
  const prompt = `
Проверь риск несоответствия задаче школьным приказам.
Верни строго JSON:
{"risk":"low|medium|high","reason":"кратко","orderRefs":["76","110"]}.

Приказы:
${orders.map((o) => `${o.id}: ${o.content}`).join("\n")}

Задача:
${taskText}
`;
  try {
    const raw = await askGemini(prompt);
    const normalized = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(normalized);
  } catch (error) {
    return { risk: "medium", reason: "Автооценка: требуется ручная проверка", orderRefs: [] };
  }
}

module.exports = {
  askGemini,
  parseDirectorTasks,
  simplifyOrder,
  detectComplianceRisk,
};
