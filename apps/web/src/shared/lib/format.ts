import { RegistrationStatus, RegistrationAction } from '@workshop-desk/contracts';
export function formatUtc(value: string): string {
  try {
    return `${new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value))} UTC`;
  } catch {
    return `${value} UTC`;
  }
}

export function displayNameForParticipant(id: string): string {
  return id;
}

export function registrationStatusLabel(status: string): string {
  switch (status) {
    case RegistrationStatus.Confirmed:
      return 'Подтверждена';
    case RegistrationStatus.Waitlisted:
      return 'В листе ожидания';
    case RegistrationStatus.Cancelled:
      return 'Отменена';
    case 'pending':
      return 'Ожидает ответа';
    case 'unknown':
      return 'Исход неизвестен';
    default:
      return status;
  }
}

export function registrationStatusClass(status: string): string {
  switch (status) {
    case RegistrationStatus.Confirmed:
      return 'status-confirmed';
    case RegistrationStatus.Waitlisted:
      return 'status-waitlisted';
    case RegistrationStatus.Cancelled:
      return 'status-cancelled';
    case 'unknown':
      return 'status-unknown';
    case 'pending':
      return 'status-pending';
    default:
      return '';
  }
}

export function operationActionLabel(action: string): string {
  switch (action) {
    case RegistrationAction.Confirm:
      return 'Подтверждение';
    case RegistrationAction.Cancel:
      return 'Отмена';
    case 'waitlist':
      return 'Заявка в лист ожидания';
    case 'register':
      return 'Бронирование места';
    case 'restored':
      return 'Восстановленная операция';
    default:
      return 'Операция';
  }
}
