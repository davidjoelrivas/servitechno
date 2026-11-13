import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export const money = (value: string | number | null | undefined) => new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" }).format(Number(value ?? 0));
export const dateTime = (value: string) => new Intl.DateTimeFormat("es-HN", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Tegucigalpa" }).format(new Date(value));

