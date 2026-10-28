/**
 * Permission notices (AI data sharing, Google Calendar access) shown in the
 * app's own style. The dialog registers itself here while mounted at the root;
 * when it is not mounted, callers fall back to the system alert.
 */
export type DisclosureRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
};

type DisclosurePresenter = (request: DisclosureRequest) => Promise<boolean>;
let presenter: DisclosurePresenter | null = null;

/** Returns the unregister function. */
export const registerDisclosurePresenter = (next: DisclosurePresenter) => {
  presenter = next;
  return () => {
    if (presenter === next) presenter = null;
  };
};

/** Resolves true when the user confirms; null when no app dialog is mounted. */
export const presentDisclosure = (request: DisclosureRequest): Promise<boolean> | null =>
  presenter ? presenter(request) : null;
