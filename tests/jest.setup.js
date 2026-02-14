jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => require('path').join(__dirname, '..', 'test-data')),
  },
  ipcRenderer: {
    send: jest.fn(),
  },
}));

jest.mock('@electron/remote', () => ({
  app: {
    getPath: jest.fn(() => require('path').join(__dirname, '..', 'test-data')),
  },
}));
