"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { Alert, type AlertProps } from "./alert";

const NOTIFICATION_EVENT = "universe:notification";
const DEFAULT_DURATION_MS = 3000;
const MAX_NOTIFICATIONS = 4;

export type NotificationVariant = NonNullable<AlertProps["variant"]>;

export type NotificationInput = {
  className?: string;
  durationMs?: number;
  id?: string;
  message: string;
  title?: string;
  variant?: NotificationVariant;
};

type NotificationItem = NotificationInput & {
  durationMs: number;
  id: string;
  variant: NotificationVariant;
};

let notificationIndex = 0;

function createNotification(input: NotificationInput): NotificationItem {
  notificationIndex += 1;

  return {
    ...input,
    durationMs: Math.max(DEFAULT_DURATION_MS, input.durationMs ?? DEFAULT_DURATION_MS),
    id: input.id ?? `notification-${Date.now()}-${notificationIndex}`,
    variant: input.variant ?? "default",
  };
}

export function notify(input: NotificationInput) {
  const item = createNotification(input);

  if (typeof window === "undefined") {
    return item.id;
  }

  window.dispatchEvent(new CustomEvent<NotificationItem>(NOTIFICATION_EVENT, { detail: item }));

  return item.id;
}

export const notification = {
  show: notify,
  success(message: string, options?: Omit<NotificationInput, "message" | "variant">) {
    return notify({ ...options, message, variant: "success" });
  },
  warning(message: string, options?: Omit<NotificationInput, "message" | "variant">) {
    return notify({ ...options, message, variant: "warning" });
  },
  error(message: string, options?: Omit<NotificationInput, "message" | "variant">) {
    return notify({ ...options, message, variant: "destructive" });
  },
  muted(message: string, options?: Omit<NotificationInput, "message" | "variant">) {
    return notify({ ...options, message, variant: "muted" });
  },
};

export function Notification({ className, durationMs, message, title, variant }: NotificationItem) {
  return (
    <Alert
      aria-live={variant === "destructive" ? "assertive" : "polite"}
      className={cn(
        "static left-auto top-auto z-auto w-full max-w-none translate-x-0",
        className,
      )}
      role={variant === "destructive" ? "alert" : "status"}
      style={{ "--tw-animation-delay": `${durationMs}ms` } as React.CSSProperties}
      variant={variant}
    >
      {title ? <span className="mr-1 font-semibold">{title}</span> : null}
      {message}
    </Alert>
  );
}

export function NotificationViewport() {
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const timeoutsRef = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    const timeouts = timeoutsRef.current;

    function removeNotification(id: string) {
      window.clearTimeout(timeouts.get(id));
      timeouts.delete(id);
      setItems((current) => current.filter((item) => item.id !== id));
    }

    function handleNotification(event: Event) {
      const item = (event as CustomEvent<NotificationItem>).detail;

      window.clearTimeout(timeouts.get(item.id));
      setItems((current) => [
        item,
        ...current.filter((currentItem) => currentItem.id !== item.id),
      ].slice(0, MAX_NOTIFICATIONS));

      const timeout = window.setTimeout(
        () => removeNotification(item.id),
        item.durationMs + 650,
      );

      timeouts.set(item.id, timeout);
    }

    window.addEventListener(NOTIFICATION_EVENT, handleNotification);

    return () => {
      window.removeEventListener(NOTIFICATION_EVENT, handleNotification);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] mx-auto flex w-full max-w-md flex-col gap-3 px-3 sm:top-5 sm:px-0">
      {items.map((item) => (
        <Notification key={item.id} {...item} />
      ))}
    </div>
  );
}
