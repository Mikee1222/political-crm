export function getAgeFromBirthday(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function getDaysUntilBirthday(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next.getTime() < today.setHours(0, 0, 0, 0)) next.setFullYear(next.getFullYear() + 1);
  return Math.ceil((next.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
}
