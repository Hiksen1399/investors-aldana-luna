const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const xtbDailySender = /^dailystatements@mail\.xtb\.com$/i;
const xtbExecutionSubject = /^confirmacion de ejecucion de orden\s*-\s*([0-9]{4,})\s*$/i;
const xtbDailyStatementFilename = /^([0-9]{4,})_[0-9]{8}_DailyStatement\.pdf$/i;

export function xtbExecutionAccountNumber(sender?: string | null, subject?: string | null) {
  if (!xtbDailySender.test((sender ?? '').trim())) return undefined;
  return normalize(subject ?? '').match(xtbExecutionSubject)?.[1];
}

export function xtbStatementAccountNumber(filename?: string | null) {
  return (filename ?? '').trim().match(xtbDailyStatementFilename)?.[1];
}

export function isXtbExecutionEmail(sender?: string | null, subject?: string | null, allowedAccountNumbers?: ReadonlySet<string>) {
  const accountNumber = xtbExecutionAccountNumber(sender, subject);
  if (!accountNumber) return false;
  return !allowedAccountNumbers || allowedAccountNumbers.has(accountNumber);
}

export function isXtbDailyStatement(filename?: string | null, expectedAccountNumber?: string) {
  const accountNumber = xtbStatementAccountNumber(filename);
  return Boolean(accountNumber && (!expectedAccountNumber || accountNumber === expectedAccountNumber));
}
