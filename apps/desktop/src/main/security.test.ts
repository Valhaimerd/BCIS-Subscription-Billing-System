import { describe, expect, it } from 'vitest';

import { secureWebPreferences } from './security.js';

describe('secureWebPreferences', () => {
  it('isolates the renderer from Node.js and privileged APIs', () => {
    expect(secureWebPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });
});
