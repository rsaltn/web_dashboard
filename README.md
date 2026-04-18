# AI Zavuch Dashboard (MVP)

Node.js MVP for AIS Hack 3.0:
- Telegram bot for school chat intake
- Attendance and incident parsing
- Smart teacher substitution
- Gemini-based task parsing and order simplification
- Web dashboard for school director

## 1) Setup

```bash
npm install
cp .env.example .env
```

Fill `.env`:
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- optional: `DIRECTOR_CHAT_ID`, `TEACHERS_GROUP_CHAT_ID`

## 2) Run

```bash
npm run dev
```

Open:
- Dashboard: `http://localhost:3000`

## 3) API quick checks

- `GET /api/health`
- `GET /api/dashboard`
- `POST /api/tasks/from-text` with `{ "text": "..." }`
- `POST /api/substitutions/sick` with `{ "teacherName": "Аскар Нурланов" }`
- `POST /api/orders/simplify` with `{ "orderText": "..." }`

## 4) Telegram usage

First-time binding (required for personal notifications):
- `/start`
- `/register ФИО` (example: `/register Айгерим Садыкова`)
- `/whoami` (check current binding)

Teachers can send:
- Attendance: `1А - 25 детей, 2 болеют`
- Incident: `В кабинете 12 сломалась парта`

Any chat can request:
- `/summary` to get today's meal summary.

## Notes

- Speech-to-text is intentionally removed (per requirements).
- Mock data is in `src/data/employees.json` and `src/data/schedule.json`.
# web_dashboard
