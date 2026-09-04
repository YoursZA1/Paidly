export function greetingForHour(hour = new Date().getHours()) {
  const h = Number(hour);
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function firstNameFromEmployee(name, email) {
  const fromName = String(name || "").trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = String(email || "").split("@")[0];
  return local || "there";
}
