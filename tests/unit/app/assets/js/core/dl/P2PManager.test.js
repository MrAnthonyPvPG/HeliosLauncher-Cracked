const P2PManager = require('../../../../../../../app/assets/js/core/dl/P2PManager');
const ConfigManager = require('../../../../../../../app/assets/js/configmanager');

jest.mock('../../../../../../../app/assets/js/configmanager', () => ({
    getCommonDirectory: jest.fn(() => '/mock/common')
}));

jest.mock('dgram', () => ({
    createSocket: jest.fn(() => ({
        on: jest.fn(),
        bind: jest.fn((port, cb) => cb && cb()),
        setBroadcast: jest.fn(),
        addMembership: jest.fn(),
        setMulticastTTL: jest.fn(),
        send: jest.fn(),
        close: jest.fn()
    }))
}));

jest.mock('http', () => ({
    createServer: jest.fn(() => ({
        on: jest.fn(),
        listen: jest.fn((port, cb) => cb && cb()),
        address: jest.fn(() => ({ port: 12345 })),
        close: jest.fn()
    }))
}));

describe('P2PManager', () => {
    afterEach(() => {
        P2PManager.stop();
        jest.clearAllMocks();
    });

    test('should start server and discovery', () => {
        P2PManager.start();
        expect(P2PManager.started).toBe(true);
        expect(require('http').createServer).toHaveBeenCalled();
        expect(require('dgram').createSocket).toHaveBeenCalled();
    });

    test('should handle discovery message', () => {
        P2PManager.start();
        // Get the socket instance created by P2PManager
        const createSocketMock = require('dgram').createSocket;
        // The most recent call created the socket used by P2PManager
        const socket = createSocketMock.mock.results[createSocketMock.mock.results.length - 1].value;

        const onMessage = socket.on.mock.calls.find(call => call[0] === 'message')[1];

        const rinfo = { address: '192.168.1.5', port: 5555 };
        const msg = Buffer.from(`HELIOS_P2P:other-id:5000`);

        onMessage(msg, rinfo);

        expect(P2PManager.peers.size).toBe(1);
        const peer = P2PManager.peers.get('other-id');
        expect(peer.ip).toBe('192.168.1.5');
        expect(peer.port).toBe(5000);
    });
});
