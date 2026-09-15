import { registrationStatusClass, registrationStatusLabel } from '../lib/format.ts';

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`status ${registrationStatusClass(status)}`}>
      {registrationStatusLabel(status)}
    </span>
  );
}
