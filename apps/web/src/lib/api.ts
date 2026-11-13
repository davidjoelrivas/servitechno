const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem("servitechno_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ message: "No fue posible completar la operación" }));
    const message = Array.isArray(body.message)
      ? body.message.join(". ")
      : body.message;
    if (response.status === 401) {
      sessionStorage.removeItem("servitechno_token");
      sessionStorage.removeItem("servitechno_user");
      window.dispatchEvent(new Event("servitechno-unauthorized"));
    }
    throw new ApiClientError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export async function downloadPdf(path: string, filename: string) {
  const token = sessionStorage.getItem("servitechno_token");
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok)
    throw new ApiClientError(
      "No fue posible descargar el documento",
      response.status,
    );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function apiFormData<T>(path: string, body: FormData): Promise<T> {
  const token = sessionStorage.getItem("servitechno_token");
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ message: "No fue posible subir los archivos" }));
    throw new ApiClientError(
      Array.isArray(payload.message)
        ? payload.message.join(". ")
        : payload.message,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export async function authenticatedBlob(path: string): Promise<Blob> {
  const token = sessionStorage.getItem("servitechno_token");
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok)
    throw new ApiClientError(
      "No fue posible cargar la evidencia",
      response.status,
    );
  return response.blob();
}
