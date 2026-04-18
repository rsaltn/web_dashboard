function getDayName(dateString) {
  const date = dateString ? new Date(dateString) : new Date();
  const map = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return map[date.getDay()];
}

function getRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function buildSubstitutionPlan({ teacherName, dateString, schedule, employees }) {
  const day = getDayName(dateString);
  const teacherNorm = normalize(teacherName);
  let affectedLessons = schedule.filter(
    (s) => s.day === day && normalize(s.teacher) === teacherNorm
  );
  if (affectedLessons.length === 0) {
    affectedLessons = schedule.filter((s) => normalize(s.teacher) === teacherNorm);
  }

  const substitutions = affectedLessons.map((lesson) => {
    const byCandidates = (lesson.candidateTeachers || [])
      .map((name) => employees.find((e) => e.role === "teacher" && normalize(e.name) === normalize(name)))
      .filter(Boolean)
      .filter((e) => normalize(e.name) !== teacherNorm);

    const sameSubjectTeachers = employees.filter(
      (e) => e.role === "teacher" && e.subject === lesson.subject && e.name !== teacherName
    );
    const baseCandidates = byCandidates.length > 0 ? byCandidates : sameSubjectTeachers;

    const freeTeachers = baseCandidates.filter((candidate) => {
      const busyAtSameTime = schedule.some(
        (s) => s.day === lesson.day && s.lesson === lesson.lesson && normalize(s.teacher) === normalize(candidate.name)
      );
      return !busyAtSameTime;
    });

    const pool = freeTeachers.length > 0 ? freeTeachers : baseCandidates;
    const suggested = pool.length > 0 ? getRandomItem(pool) : null;

    return {
      day: lesson.day,
      time: lesson.time || "",
      className: lesson.className,
      lesson: lesson.lesson,
      subject: lesson.subject,
      originalTeacher: teacherName,
      substituteTeacher: suggested ? suggested.name : null,
      candidateTeachers: pool.map((p) => p.name),
      room: lesson.room,
      fallbackUsed: freeTeachers.length === 0,
    };
  });

  return substitutions;
}

module.exports = { buildSubstitutionPlan };
