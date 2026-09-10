export interface NativeSystemNotificationOptions {
  title: string;
  body: string;
  silent: boolean;
  icon: string;
}

export interface NativeSystemNotification {
  once(event: "show" | "close", listener: () => void): this;
  once(event: "failed", listener: (event: unknown, error: string) => void): this;
  show(): void;
}

export interface SystemNotificationDiagnostics {
  log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void;
}

export interface SystemNotificationServiceOptions {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  iconPath: string;
  isSupported: () => boolean;
  createNotification: (options: NativeSystemNotificationOptions) => NativeSystemNotification;
  registerActivationHandler: (handler: () => void) => void;
  onActivated: () => unknown;
  diagnostics: SystemNotificationDiagnostics;
}

export interface SystemNotificationRequest {
  title: string;
  body: string;
  enabled: boolean;
  force?: boolean;
}

export interface SystemNotificationService {
  initialize(): void;
  show(request: SystemNotificationRequest): boolean;
}

export interface CacheCompletionNotificationContext {
  processedCount: number;
  activeDurationMs: number;
  minimumActiveDurationMs: number;
}

export const shouldShowCacheCompletionNotification = (
  context: CacheCompletionNotificationContext
) => (
  context.processedCount > 0
  && context.activeDurationMs >= context.minimumActiveDurationMs
);

const safeLog = (
  diagnostics: SystemNotificationDiagnostics,
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown> = {}
) => {
  try {
    diagnostics.log(level, event, data);
  } catch {
    // Diagnostics must never prevent notification handling.
  }
};

export const createSystemNotificationService = (
  options: SystemNotificationServiceOptions
): SystemNotificationService => {
  const activeNotifications = new Set<NativeSystemNotification>();
  const canUsePackagedWindowsToast = options.platform === "win32" && options.isPackaged;
  let initialized = false;

  return {
    initialize: () => {
      if (initialized || !canUsePackagedWindowsToast) return;
      initialized = true;
      try {
        options.registerActivationHandler(() => {
          void options.onActivated();
        });
      } catch (error) {
        safeLog(options.diagnostics, "error", "system_notification.activation_registration_failed", {
          packaged: true,
          error
        });
      }
    },
    show: (request) => {
      if ((!request.enabled && !request.force) || options.platform !== "win32") {
        return false;
      }
      if (!options.isPackaged) {
        safeLog(options.diagnostics, "warn", "system_notification.development_skipped", { packaged: false });
        return false;
      }
      if (!options.isSupported()) {
        safeLog(options.diagnostics, "warn", "system_notification.unsupported", { packaged: true });
        return false;
      }

      try {
        const notification = options.createNotification({
          title: request.title,
          body: request.body,
          silent: true,
          icon: options.iconPath
        });
        activeNotifications.add(notification);
        notification.once("show", () => {
          activeNotifications.delete(notification);
          safeLog(options.diagnostics, "info", "system_notification.shown", { packaged: true });
        });
        notification.once("failed", (_event, error) => {
          activeNotifications.delete(notification);
          safeLog(options.diagnostics, "error", "system_notification.failed", { packaged: true, error });
        });
        notification.once("close", () => {
          activeNotifications.delete(notification);
        });
        notification.show();
        return true;
      } catch (error) {
        safeLog(options.diagnostics, "error", "system_notification.failed", { packaged: true, error });
        return false;
      }
    }
  };
};
