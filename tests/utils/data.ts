export function uniqueName(prefix: string) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}-${pad2(
    now.getUTCHours()
  )}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
  return `${prefix} ${stamp} ${Math.floor(Math.random() * 10_000)}`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

