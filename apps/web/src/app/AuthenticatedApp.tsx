import { UserRole, RegistrationAction } from '@workshop-desk/contracts';
import { useCallback, useState } from 'react';
import type { User } from '@workshop-desk/contracts';
import type { PreviewApi } from '../features/participant-preview/model/use-participant-preview.ts';
import { useParticipantPreview } from '../features/participant-preview/model/use-participant-preview.ts';
import { PreviewView } from '../features/participant-preview/ui/PreviewView.tsx';
import type { RegistrationApi } from '../features/registrations/model/use-registration-controller.ts';
import { useRegistrationController } from '../features/registrations/model/use-registration-controller.ts';
import { CancellationDialog } from '../features/registrations/ui/CancellationDialog.tsx';
import { ParticipantView } from '../features/registrations/ui/ParticipantView.tsx';
import { SyncPanel } from '../features/registrations/ui/SyncPanel.tsx';
import { OrganizerView } from '../features/organizer/ui/OrganizerView.tsx';
import {
  useParticipantDirectory,
  type ParticipantDirectoryApi,
} from '../features/organizer/model/use-participant-directory.ts';
import { CatalogView } from '../features/workshops/ui/CatalogView.tsx';

export type AuthenticatedApi = RegistrationApi & PreviewApi & ParticipantDirectoryApi;

export function AuthenticatedApp({
  identity,
  api,
  onSessionExpired,
  onLogout,
}: {
  identity: User;
  api: AuthenticatedApi;
  onSessionExpired: () => void;
  onLogout: () => void;
}) {
  const roleLabel = identity.role === UserRole.Organizer ? 'Организатор' : 'Участник';
  const showRole =
    identity.displayName.trim().toLocaleLowerCase('ru') !== roleLabel.toLocaleLowerCase('ru');
  const controller = useRegistrationController(identity, api, onSessionExpired);
  const preview = useParticipantPreview(api, onSessionExpired);
  const directory = useParticipantDirectory(api, onSessionExpired);
  const [view, setView] = useState<'catalog' | 'workshop' | 'organizer' | 'preview'>(
    identity.role === UserRole.Organizer ? 'organizer' : 'catalog',
  );
  const [servicesOpen, setServicesOpen] = useState(false);
  const {
    users: directoryUsers,
    status: directoryStatus,
    error: directoryError,
    participantName: lookupParticipantName,
    load: loadParticipants,
  } = directory;

  const participantName = lookupParticipantName;

  const changeWorkshop = useCallback(
    (workshopId: string) => {
      controller.handleWorkshopChange(workshopId);
      setView(identity.role === UserRole.Organizer ? 'organizer' : 'workshop');
    },
    [controller, identity.role],
  );

  const openWorkshop = useCallback(
    (workshopId: string) => {
      controller.openWorkshop(workshopId);
      setView(identity.role === UserRole.Organizer ? 'organizer' : 'workshop');
    },
    [controller, identity.role],
  );

  const leavePreview = useCallback(
    (nextView: 'catalog' | 'organizer' = 'organizer') => {
      preview.leavePreview();
      setView(nextView);
      controller.refreshAll();
    },
    [controller, preview],
  );

  const loadDirectory = useCallback(() => {
    loadParticipants();
  }, [loadParticipants]);

  const toggleServices = useCallback(() => {
    setServicesOpen((open) => !open);
    if (directoryStatus === 'idle') {
      loadDirectory();
    }
  }, [directoryStatus, loadDirectory]);

  const selectPreviewParticipant = useCallback(
    (participant: User) => {
      setServicesOpen(false);
      setView('preview');
      preview.openPreview(participant);
    },
    [preview],
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#catalog"
          onClick={(event) => {
            event.preventDefault();
            if (preview.previewUser) {
              leavePreview('catalog');
            } else {
              setView('catalog');
            }
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>
            <strong>Практика</strong>
            <small>Воркшопы для инженеров</small>
          </span>
        </a>

        <div className="context">
          <span className="account-name">{identity.displayName}</span>
          {showRole && <span className="account-role">{roleLabel}</span>}
          <button type="button" className="button button-quiet" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      {identity.role === UserRole.Organizer && !preview.previewUser && (
        <section className="services-menu" aria-label="Сервисы">
          <button
            type="button"
            className="button button-quiet"
            aria-expanded={servicesOpen}
            onClick={toggleServices}
          >
            Сервисы
          </button>
          {servicesOpen && (
            <div className="panel stack-small" role="menu">
              <strong>Просмотр от лица участника</strong>
              {directoryStatus === 'loading' && <span role="status">Загружаем список…</span>}
              {directoryStatus === 'error' && (
                <div className="stack-small">
                  <span className="field-error" role="alert">
                    {directoryError}
                  </span>
                  <button type="button" className="button button-quiet" onClick={loadDirectory}>
                    Повторить
                  </button>
                </div>
              )}
              {directoryStatus === 'ready' && directoryUsers.length === 0 && (
                <span className="muted">Участники не найдены.</span>
              )}
              {directoryStatus === 'ready' &&
                directoryUsers.map((participant) => (
                  <button
                    type="button"
                    className="button button-quiet"
                    role="menuitem"
                    key={participant.id}
                    onClick={() => selectPreviewParticipant(participant)}
                  >
                    {participant.displayName}
                  </button>
                ))}
            </div>
          )}
        </section>
      )}

      <nav className="actions" aria-label="Разделы приложения">
        <button
          type="button"
          className={`button ${view === 'catalog' ? 'button-primary' : 'button-quiet'}`}
          aria-current={view === 'catalog' ? 'page' : undefined}
          onClick={() => (preview.previewUser ? leavePreview('catalog') : setView('catalog'))}
        >
          Каталог
        </button>

        {identity.role === UserRole.Participant && (
          <button
            type="button"
            className={`button ${view === 'workshop' ? 'button-primary' : 'button-quiet'}`}
            aria-current={view === 'workshop' ? 'page' : undefined}
            onClick={() => setView('workshop')}
            disabled={!controller.selectedWorkshopId}
          >
            Текущий воркшоп
          </button>
        )}

        {identity.role === UserRole.Organizer && (
          <button
            type="button"
            className={`button ${view === 'organizer' ? 'button-primary' : 'button-quiet'}`}
            aria-current={view === 'organizer' ? 'page' : undefined}
            onClick={() => (preview.previewUser ? leavePreview('organizer') : setView('organizer'))}
          >
            Панель организатора
          </button>
        )}
      </nav>

      <div className="layout layout-wide">
        <div className="stack">
          {preview.previewUser && view === 'preview' && (
            <div className="notice notice-preview" role="status" data-testid="preview-banner">
              <strong>Просмотр от лица {preview.previewUser.displayName}</strong> · Только просмотр
              <button type="button" className="button button-quiet" onClick={() => leavePreview()}>
                Вернуться
              </button>
            </div>
          )}

          {controller.pageNotice && (
            <div className="notice" role="status">
              {controller.pageNotice}
            </div>
          )}

          {view === 'catalog' && (
            <CatalogView
              catalog={controller.catalog}
              identity={identity}
              onOpen={openWorkshop}
              onRefresh={controller.refreshAll}
            />
          )}

          {view === 'workshop' && identity.role === UserRole.Participant && (
            <ParticipantView
              state={controller.storeState}
              identity={identity}
              workshop={controller.selectedWorkshop}
              registration={controller.participantRegistration}
              busyOperation={controller.participantBusyOperation}
              unknownOperations={controller.unknownOperations}
              formOpen={controller.formOpen}
              formSubmitting={controller.formSubmitting}
              draft={controller.draft}
              errors={controller.draftErrors}
              capacityConflict={controller.capacityConflict}
              formMode={controller.formMode}
              editing={controller.editing}
              onEdit={controller.openEditForm}
              onBack={() => setView('catalog')}
              onOpenForm={controller.openParticipantForm}
              onCloseForm={controller.resetParticipantForm}
              onCancel={controller.requestCancellation}
              onSubmit={controller.startParticipantRegistration}
              onDraftChange={controller.updateDraft}
              onRefresh={controller.refreshAll}
              onContinue={controller.continueOperation}
              canContinue={controller.canContinue}
              participantName={participantName}
            />
          )}

          {view === 'preview' && preview.previewUser && identity.role === UserRole.Organizer && (
            <PreviewView
              target={preview.previewUser}
              catalog={preview.previewCatalog}
              details={preview.previewDetails}
              selectedWorkshopId={preview.previewWorkshopId}
              formOpen={preview.previewFormOpen}
              onRefresh={preview.refreshPreviewCatalog}
              onWorkshopChange={preview.selectPreviewWorkshop}
              onOpenForm={preview.openPreviewForm}
              onCloseForm={preview.closePreviewForm}
              onBack={leavePreview}
            />
          )}

          {view === 'organizer' && identity.role === UserRole.Organizer && (
            <OrganizerView
              state={controller.storeState}
              identity={identity}
              workshops={controller.catalog.workshops}
              selectedWorkshopId={controller.selectedWorkshopId}
              workshop={controller.selectedWorkshop}
              onWorkshopChange={changeWorkshop}
              onRefresh={controller.refreshAll}
              onConfirm={(registration) =>
                controller.startOrganizerMutation(registration, RegistrationAction.Confirm)
              }
              onCancel={controller.requestCancellation}
              onContinue={controller.continueOperation}
              canContinue={controller.canContinue}
              participantName={participantName}
            />
          )}

          {view === 'organizer' && identity.role !== UserRole.Organizer && (
            <section className="panel error-state" role="alert">
              Панель организатора доступна только пользователю-организатору.
            </section>
          )}
          <SyncPanel state={controller.storeState} onRefresh={controller.refreshAll} />
        </div>
      </div>

      <CancellationDialog
        target={controller.cancelTarget}
        onDismiss={controller.dismissCancellation}
        onConfirm={controller.handleCancelConfirmed}
      />
    </main>
  );
}
