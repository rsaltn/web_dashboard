const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  directorChatId: process.env.DIRECTOR_CHAT_ID || "",
  teachersGroupChatId: process.env.TEACHERS_GROUP_CHAT_ID || "",
  dataDir: path.join(process.cwd(), "src", "data"),
};
