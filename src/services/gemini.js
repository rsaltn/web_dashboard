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

ВАЖНО: 
- Имена могут быть на русском, казахском или английском языках
- Ищи имена по частичному совпадению (например "Елдос" = "Eldos Seitsamuly")
- Если имя не найдено точно, найди наиболее похожее

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

function normalizeForSearch(str) {
  // Normalize for fuzzy matching
  return str
    .toLowerCase()
    .replace(/[её]/g, 'e')
    .replace(/[ий]/g, 'i')
    .replace(/[аa]/g, 'a')
    .replace(/[оo]/g, 'o')
    .replace(/[уu]/g, 'u')
    .replace(/\s+/g, '');
}

function findEmployeeByName(nameQuery, employees) {
  const query = normalizeForSearch(nameQuery);
  
  // Exact match first
  let match = employees.find((e) => normalizeForSearch(e.name) === query);
  if (match) return match;
  
  // Partial match by first name
  match = employees.find((e) => {
    const firstName = e.name.split(' ')[0];
    return normalizeForSearch(firstName) === query || query.includes(normalizeForSearch(firstName));
  });
  if (match) return match;
  
  // Partial match by last name
  match = employees.find((e) => {
    const lastName = e.name.split(' ')[1] || '';
    return normalizeForSearch(lastName) === query || query.includes(normalizeForSearch(lastName));
  });
  if (match) return match;
  
  // Any partial match
  match = employees.find((e) => {
    const normalized = normalizeForSearch(e.name);
    return normalized.includes(query) || query.includes(normalized);
  });
  
  return match;
}

function parseDirectorTasksFallback(text, employees) {
  const chunks = text
    .split(/\n|;/)
    .map((x) => x.trim())
    .filter(Boolean);

  const results = [];
  for (const chunk of chunks) {
    // Try to find employee by fuzzy matching
    const words = chunk.split(/[\s,]+/);
    let matched = null;
    
    // Try each word as potential name
    for (const word of words) {
      if (word.length > 2) {
        matched = findEmployeeByName(word, employees);
        if (matched) break;
      }
    }
    
    // Try first two words as full name
    if (!matched && words.length >= 2) {
      const fullName = `${words[0]} ${words[1]}`;
      matched = findEmployeeByName(fullName, employees);
    }
    
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
