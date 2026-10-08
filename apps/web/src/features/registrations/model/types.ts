import { RegistrationAction } from '@workshop-desk/contracts';
import type { CatalogWorkshop, Registration, WorkshopSnapshot } from '@workshop-desk/contracts';
import type { RegistrationMode } from '../../../shared/api/index.ts';
import type { OperationDescriptor, OperationStoreState } from './operations.ts';

export type View = 'catalog' | 'workshop' | 'organizer' | 'preview';

export type CatalogState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  workshops: CatalogWorkshop[];
  error?: string;
};

export type Draft = {
  name: string;
  comment: string;
};

export type DraftErrors = {
  name?: string;
  comment?: string;
  form?: string;
};

export type CancelTarget = {
  registration: Registration;
  scope: 'participant' | 'organizer';
};

export type OriginContext = {
  actorId: string;
  workshopId: string;
  contextGeneration: number;
};

export type MutationResponse = {
  registration: Registration;
};

export type PreviewCatalogState = CatalogState;

export type WorkshopResponseLike = {
  workshop: WorkshopSnapshot;
  myRegistration: Registration | null;
};

export type RegistrationController = {
  store: import('./operations.ts').OperationStore;
  storeState: OperationStoreState;
  catalog: CatalogState;
  selectedWorkshopId: string;
  selectedWorkshop: WorkshopSnapshot | undefined;
  participantRegistration: Registration | null;
  unknownOperations: OperationDescriptor[];
  participantBusyOperation: OperationDescriptor | null;
  draft: Draft;
  draftErrors: DraftErrors;
  formOpen: boolean;
  formSubmitting: boolean;
  capacityConflict: boolean;
  formMode: RegistrationMode;
  editing: boolean;
  openEditForm: () => void;
  cancelTarget: CancelTarget | null;
  pageNotice?: string;
  refreshAll: () => void;
  resetParticipantForm: () => void;
  openParticipantForm: () => void;
  updateDraft: (field: keyof Draft, value: string) => void;
  startParticipantRegistration: (mode: RegistrationMode) => void;
  startOrganizerMutation: (
    registration: Registration,
    action: typeof RegistrationAction.Confirm | typeof RegistrationAction.Cancel,
  ) => void;
  requestCancellation: (registration: Registration, trigger: HTMLElement) => void;
  dismissCancellation: () => void;
  handleCancelConfirmed: (target: CancelTarget) => void;
  continueOperation: (operation: OperationDescriptor) => void;
  canContinue: (operation: OperationDescriptor) => boolean;
  handleWorkshopChange: (workshopId: string) => void;
  openWorkshop: (workshopId: string) => void;
  participantName: (participantId: string) => string;
};
