import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString))
}

export function formatRelativeTime(dateString: string) {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const date = new Date(dateString);
  const now = new Date();
  
  const daysDifference = Math.round(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (Math.abs(daysDifference) < 1) {
    const hoursDifference = Math.round(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60)
    );
    if (Math.abs(hoursDifference) < 1) {
      const minutesDifference = Math.round(
        (date.getTime() - now.getTime()) / (1000 * 60)
      );
      return rtf.format(minutesDifference, "minute");
    }
    return rtf.format(hoursDifference, "hour");
  }
  
  return rtf.format(daysDifference, "day");
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}
