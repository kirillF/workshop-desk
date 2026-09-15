import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogWorkshop, User, WorkshopResponse } from '@workshop-desk/contracts';
import type { ApiRequestOptions } from '../../../shared/api/index.ts';
import { isUnauthenticatedError, toOperationError } from '../../../shared/lib/errors.ts';
import type { PreviewCatalogState, WorkshopResponseLike } from '../../registrations/model/types.ts';

export interface PreviewApi {
  getWorkshops(options?: ApiRequestOptions): Promise<{ workshops: CatalogWorkshop[] }>;
  getWorkshop(workshopId: string, options?: ApiRequestOptions): Promise<WorkshopResponse>;
}

export interface ParticipantPreviewController {
  previewUser: User | null;
  previewCatalog: PreviewCatalogState;
  previewWorkshopId: string;
  previewDetails: WorkshopResponseLike | null;
  previewFormOpen: boolean;
  openPreview: (participant: User) => void;
  refreshPreviewCatalog: () => void;
  selectPreviewWorkshop: (workshopId: string) => void;
  openPreviewForm: () => void;
  closePreviewForm: () => void;
  leavePreview: () => void;
}

/**
 * Owns participant preview target and read generations. The organizer session
 * remains the actor; previewUser is only sent as a read projection selector.
 */
export function useParticipantPreview(
  api: PreviewApi,
  onSessionExpired: () => void,
): ParticipantPreviewController {
  const [previewUser, setPreviewUser] = useState<User | null>(null);
  const [previewCatalog, setPreviewCatalog] = useState<PreviewCatalogState>({
    status: 'idle',
    workshops: [],
  });
  const [previewWorkshopId, setPreviewWorkshopId] = useState('');
  const [previewDetails, setPreviewDetails] = useState<WorkshopResponseLike | null>(null);
  const [previewFormOpen, setPreviewFormOpen] = useState(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const loadCatalog = useCallback(
    (participant: User) => {
      const generation = ++generationRef.current;
      setPreviewCatalog({ status: 'loading', workshops: [] });
      setPreviewWorkshopId('');
      setPreviewDetails(null);
      setPreviewFormOpen(false);

      void api
        .getWorkshops({ previewUserId: participant.id })
        .then((response) => {
          if (!mountedRef.current || generation !== generationRef.current) {
            return;
          }
          setPreviewCatalog({ status: 'ready', workshops: response.workshops });
          setPreviewWorkshopId((current) =>
            current && response.workshops.some((item) => item.id === current)
              ? current
              : (response.workshops[0]?.id ?? ''),
          );
        })
        .catch((error: unknown) => {
          if (!mountedRef.current || generation !== generationRef.current) {
            return;
          }
          if (isUnauthenticatedError(error)) {
            onSessionExpired();
            return;
          }
          setPreviewCatalog({
            status: 'error',
            workshops: [],
            error: toOperationError(error, 'Не удалось загрузить каталог участника.').message,
          });
        });
    },
    [api, onSessionExpired],
  );

  const openPreview = useCallback(
    (participant: User) => {
      setPreviewUser(participant);
      loadCatalog(participant);
    },
    [loadCatalog],
  );

  const refreshPreviewCatalog = useCallback(() => {
    if (previewUser) {
      loadCatalog(previewUser);
    }
  }, [loadCatalog, previewUser]);

  const selectPreviewWorkshop = useCallback((workshopId: string) => {
    if (!workshopId) {
      return;
    }
    ++generationRef.current;
    setPreviewWorkshopId(workshopId);
    setPreviewDetails(null);
    setPreviewFormOpen(false);
  }, []);

  const leavePreview = useCallback(() => {
    ++generationRef.current;
    setPreviewUser(null);
    setPreviewCatalog({ status: 'idle', workshops: [] });
    setPreviewWorkshopId('');
    setPreviewDetails(null);
    setPreviewFormOpen(false);
  }, []);

  const openPreviewForm = useCallback(() => {
    setPreviewFormOpen(true);
  }, []);

  const closePreviewForm = useCallback(() => {
    setPreviewFormOpen(false);
  }, []);

  useEffect(() => {
    if (!previewUser || !previewWorkshopId) {
      setPreviewDetails(null);
      return;
    }

    const generation = ++generationRef.current;
    const targetId = previewUser.id;
    void api
      .getWorkshop(previewWorkshopId, { previewUserId: targetId })
      .then((response) => {
        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          previewUser?.id !== targetId
        ) {
          return;
        }
        setPreviewDetails(response);
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || generation !== generationRef.current) {
          return;
        }
        if (isUnauthenticatedError(error)) {
          onSessionExpired();
          return;
        }
        setPreviewDetails(null);
      });
  }, [api, onSessionExpired, previewUser, previewWorkshopId]);

  return {
    previewUser,
    previewCatalog,
    previewWorkshopId,
    previewDetails,
    previewFormOpen,
    openPreview,
    refreshPreviewCatalog,
    selectPreviewWorkshop,
    openPreviewForm,
    closePreviewForm,
    leavePreview,
  };
}
