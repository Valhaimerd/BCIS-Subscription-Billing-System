import type { LoginResponse } from '@bcis/contracts';

import type { DesktopSession } from '../shared/desktop-api.js';

interface ErrorResponse {
  message?: string;
}

interface DataResponse<T> extends ErrorResponse {
  data: T;
}

export class DesktopAuthClient {
  private token: string | null = null;
  private session: DesktopSession | null = null;

  constructor(private readonly baseUrl: string) {}

  current(): DesktopSession | null {
    return this.session;
  }

  async login(credentials: { username: string; password: string }) {
    const response = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.token = response.data.accessToken;
    this.session = {
      expiresAt: response.data.expiresAt,
      locked: false,
      user: response.data.user,
    };
    return this.session;
  }

  async logout() {
    try {
      if (this.token) await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.token = null;
      this.session = null;
    }
  }

  async lock() {
    await this.request('/auth/lock', { method: 'POST' });
    if (!this.session) throw new Error('No active session.');
    this.session = { ...this.session, locked: true };
    return this.session;
  }

  async unlock(password: string) {
    await this.request('/auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (!this.session) throw new Error('No active session.');
    this.session = { ...this.session, locked: false };
    return this.session;
  }

  async data<T>(
    path: string,
    init: RequestInit = { method: 'GET' },
  ): Promise<T> {
    return (await this.request<DataResponse<T>>(path, init)).data;
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const headers = new Headers();
    if (init.body) headers.set('content-type', 'application/json');
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      redirect: 'error',
    });
    const payload = (await response.json()) as T & ErrorResponse;
    if (!response.ok) {
      throw new Error(payload.message ?? 'The API request failed.');
    }
    return payload;
  }
}
