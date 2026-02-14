const { resolveSrv } = require('dns/promises');
const { connect } = require('net');
const { LoggerUtil } = require('../util/LoggerUtil');
const { ServerBoundPacket, ClientBoundPacket, ProtocolUtils } = require('./Protocol');

const logger = LoggerUtil.getLogger('ServerStatusUtil');

/**
 * Get the handshake packet.
 *
 * @param protocol The client's protocol version.
 * @param hostname The server hostname.
 * @param port The server port.
 *
 * @see https://wiki.vg/Server_List_Ping#Handshake
 */
function getHandshakePacket(protocol, hostname, port) {
    return ServerBoundPacket.build()
        .writeVarInt(0x00) // Packet Id
        .writeVarInt(protocol)
        .writeString(hostname)
        .writeUnsignedShort(port)
        .writeVarInt(1) // State, 1 = status
        .toBuffer();
}

/**
 * Get the request packet.
 *
 * @see https://wiki.vg/Server_List_Ping#Request
 */
function getRequestPacket() {
    return ServerBoundPacket.build()
        .writeVarInt(0x00)
        .toBuffer();
}

/**
 * Some servers do not return the same status object. Unify
 * the response so that the caller need only worry about
 * handling a single format.
 *
 * @param resp The servevr status response.
 */
function unifyStatusResponse(resp) {
    // Some servers don't wrap their description in a text object.
    if (typeof resp.description === 'string') {
        resp.description = {
            text: resp.description
        };
    }
    resp.retrievedAt = (new Date()).getTime();
    return resp;
}

async function checkSrv(hostname) {
    try {
        const records = await resolveSrv(`_minecraft._tcp.${hostname}`);
        return records.length > 0 ? records[0] : null;
    }
    catch (err) {
        return null;
    }
}

async function getServerStatus(protocol, hostname, port = 25565) {
    const srvRecord = await checkSrv(hostname);
    if (srvRecord != null) {
        hostname = srvRecord.name;
        port = srvRecord.port;
    }
    return await new Promise((resolve, reject) => {
        const socket = connect(port, hostname, () => {
            socket.write(getHandshakePacket(protocol, hostname, port));
            socket.write(getRequestPacket());
        });
        socket.setTimeout(5000, () => {
            socket.destroy();
            logger.error(`Server Status Socket timed out (${hostname}:${port})`);
            reject(new Error(`Server Status Socket timed out (${hostname}:${port})`));
        });
        const maxTries = 5;
        let iterations = 0;
        let bytesLeft = -1;
        socket.once('data', (data) => {
            const inboundPacket = new ClientBoundPacket(data);
            // Length of Packet ID + Data
            const packetLength = inboundPacket.readVarInt(); // First VarInt is packet length.
            const packetType = inboundPacket.readVarInt(); // Second VarInt is packet type.
            if (packetType !== 0x00) {
                // TODO
                socket.destroy();
                reject(new Error(`Invalid response. Expected packet type ${0x00}, received ${packetType}!`));
                return;
            }
            // Size of packetLength VarInt is not included in the packetLength.
            bytesLeft = packetLength + ProtocolUtils.getVarIntSize(packetLength);
            // Listener to keep reading until we have read all the bytes into the buffer.
            const packetReadListener = (nextData, doAppend) => {
                if (iterations > maxTries) {
                    socket.destroy();
                    reject(new Error(`Data read from ${hostname}:${port} exceeded ${maxTries} iterations, closing connection.`));
                    return;
                }
                ++iterations;
                if (bytesLeft > 0) {
                    bytesLeft -= nextData.length;
                    if (doAppend) {
                        inboundPacket.append(nextData);
                    }
                }
                // All bytes read, attempt conversion.
                if (bytesLeft === 0) {
                    // Remainder of Buffer is the server status json.
                    const result = inboundPacket.readString();
                    try {
                        const parsed = JSON.parse(result);
                        socket.end();
                        resolve(unifyStatusResponse(parsed));
                    }
                    catch (err) {
                        socket.destroy();
                        logger.error('Failed to parse server status JSON', err);
                        reject(new Error('Failed to parse server status JSON'));
                    }
                }
            };
            // Read the data we just received.
            packetReadListener(data, false);
            // Add a listener to keep reading if the data is too long.
            socket.on('data', (data) => packetReadListener(data, true));
        });
        socket.on('error', (err) => {
            socket.destroy();
            if (err.code === 'ENOTFOUND') {
                // ENOTFOUND = Unable to resolve.
                reject(new Error(`Server ${hostname}:${port} not found!`));
                return;
            }
            else if (err.code === 'ECONNREFUSED') {
                // ECONNREFUSED = Unable to connect to port.
                reject(new Error(`Server ${hostname}:${port} refused to connect, is the port correct?`));
                return;
            }
            else {
                logger.error(`Error trying to pull server status (${hostname}:${port})`);
                reject(err);
                return;
            }
        });
    });
}

module.exports = { getServerStatus }
