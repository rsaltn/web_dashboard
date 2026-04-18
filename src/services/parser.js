function parseAttendanceMessage(text) {
  const pattern = /(\d+[А-ЯA-Z])\s*[-:]\s*(\d+)\s*(детей|ученик|ученика)?(?:.*?(\d+)\s*(болеют|отсутств))/i;
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  return {
    className: match[1].toUpperCase(),
    present: Number(match[2] || 0),
    absent: Number(match[4] || 0),
  };
}

function parseIncidentMessage(text) {
  const incidentKeywords = ["слом", "протеч", "не работает", "инцидент", "разб", "авар"];
  const lower = text.toLowerCase();
  const hasKeyword = incidentKeywords.some((k) => lower.includes(k));
  if (!hasKeyword) {
    return null;
  }

  const roomMatch = text.match(/кабинет[е]?\s*(\d+)/i);
  return {
    description: text,
    room: roomMatch ? roomMatch[1] : "не указан",
    priority: "medium",
  };
}

function buildMealSummary(attendanceRecords) {
  const totalPresent = attendanceRecords.reduce((acc, item) => acc + item.present, 0);
  const totalAbsent = attendanceRecords.reduce((acc, item) => acc + item.absent, 0);
  return {
    totalPortions: totalPresent,
    totalAbsent,
    classesCounted: attendanceRecords.length,
  };
}

module.exports = { parseAttendanceMessage, parseIncidentMessage, buildMealSummary };
