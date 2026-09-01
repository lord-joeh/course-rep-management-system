const { initSocketIO, getSocketIO, getEmitter } = require('./socketIO');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { Emitter } = require('@socket.io/redis-emitter');
const Redis = require('ioredis');

// Mock dependencies
jest.mock('socket.io', () => {
  const mServer = {
    adapter: jest.fn(),
    use: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
  };
  return { Server: jest.fn(() => mServer) };
});

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn(() => 'mock-adapter'),
}));

jest.mock('@socket.io/redis-emitter', () => {
  return { Emitter: jest.fn(() => ({ emit: jest.fn() })) };
});

jest.mock('ioredis', () => {
  const mRedis = {
    subscribe: jest.fn(),
    on: jest.fn(),
  };
  return jest.fn(() => mRedis);
});

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  redisConfig: {},
}));

jest.mock('../config/corsOptions', () => ({
  corsOptions: {},
}));

describe('socketIO middleware', () => {
  let httpServer;
  let mockServer;

  beforeEach(() => {
    jest.clearAllMocks();
    httpServer = {};
    mockServer = new Server();

    // reset modules to clear module state for io/emitter vars
    jest.resetModules();
  });

  describe('initSocketIO', () => {
    it('should initialize socket.io and set up redis adapter', async () => {
      const { initSocketIO, getSocketIO } = require('./socketIO');

      const mServerInstance = {
        adapter: jest.fn(),
        use: jest.fn(),
        on: jest.fn(),
        emit: jest.fn(),
      };
      require('socket.io').Server.mockImplementationOnce(() => mServerInstance);

      const mSubClient = {
        subscribe: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
      };

      let redisClientCount = 0;
      require('ioredis').mockImplementation(() => {
        redisClientCount++;
        if (redisClientCount === 3) return mSubClient; // workerSubClient
        return {};
      });

      await initSocketIO(httpServer);

      expect(require('socket.io').Server).toHaveBeenCalledWith(httpServer, expect.any(Object));
      expect(require('ioredis')).toHaveBeenCalledTimes(3);
      expect(mServerInstance.adapter).toHaveBeenCalledWith('mock-adapter');
      expect(require('@socket.io/redis-emitter').Emitter).toHaveBeenCalled();
      expect(mSubClient.subscribe).toHaveBeenCalledWith('worker-events');

      const io = getSocketIO();
      expect(io).toBe(mServerInstance);
    });

    it('should fallback to no redis adapter if redis fails', async () => {
      const { initSocketIO, getSocketIO, getEmitter } = require('./socketIO');

      const mServerInstance = {
        adapter: jest.fn(),
        use: jest.fn(),
        on: jest.fn(),
        emit: jest.fn(),
      };
      require('socket.io').Server.mockImplementationOnce(() => mServerInstance);

      require('ioredis').mockImplementation(() => {
        throw new Error('Redis connection failed');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await initSocketIO(httpServer);

      expect(mServerInstance.adapter).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to setup Redis adapter for Socket.IO:',
        'Redis connection failed'
      );

      const io = getSocketIO();
      expect(io).toBe(mServerInstance);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('worker event subscription', () => {
     it('should emit received worker event to all clients', async () => {
        const { initSocketIO } = require('./socketIO');

        const mServerInstance = {
            adapter: jest.fn(),
            use: jest.fn(),
            on: jest.fn(),
            emit: jest.fn(),
        };
        require('socket.io').Server.mockImplementationOnce(() => mServerInstance);

        let messageHandler;
        const mSubClient = {
            subscribe: jest.fn().mockResolvedValue(true),
            on: jest.fn((event, handler) => {
                if (event === 'message') messageHandler = handler;
            }),
        };

        let redisClientCount = 0;
        require('ioredis').mockImplementation(() => {
            redisClientCount++;
            if (redisClientCount === 3) return mSubClient;
            return {};
        });

        await initSocketIO(httpServer);

        expect(messageHandler).toBeDefined();

        const eventData = { type: 'test-event', data: 'hello' };
        messageHandler('worker-events', JSON.stringify(eventData));

        expect(mServerInstance.emit).toHaveBeenCalledWith('test-event', eventData);
     });

     it('should handle invalid JSON gracefully', async () => {
        const { initSocketIO } = require('./socketIO');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const mServerInstance = {
            adapter: jest.fn(),
            use: jest.fn(),
            on: jest.fn(),
            emit: jest.fn(),
        };
        require('socket.io').Server.mockImplementationOnce(() => mServerInstance);

        let messageHandler;
        const mSubClient = {
            subscribe: jest.fn().mockResolvedValue(true),
            on: jest.fn((event, handler) => {
                if (event === 'message') messageHandler = handler;
            }),
        };

        let redisClientCount = 0;
        require('ioredis').mockImplementation(() => {
            redisClientCount++;
            if (redisClientCount === 3) return mSubClient;
            return {};
        });

        await initSocketIO(httpServer);

        expect(messageHandler).toBeDefined();

        messageHandler('worker-events', 'invalid-json');

        expect(mServerInstance.emit).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
     });

     it('should handle redis subscriber error', async () => {
        const { initSocketIO } = require('./socketIO');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const mServerInstance = {
            adapter: jest.fn(),
            use: jest.fn(),
            on: jest.fn(),
            emit: jest.fn(),
        };
        require('socket.io').Server.mockImplementationOnce(() => mServerInstance);

        let errorHandler;
        const mSubClient = {
            subscribe: jest.fn().mockResolvedValue(true),
            on: jest.fn((event, handler) => {
                if (event === 'error') errorHandler = handler;
            }),
        };

        let redisClientCount = 0;
        require('ioredis').mockImplementation(() => {
            redisClientCount++;
            if (redisClientCount === 3) return mSubClient;
            return {};
        });

        await initSocketIO(httpServer);

        expect(errorHandler).toBeDefined();

        errorHandler(new Error('Test error'));

        expect(consoleErrorSpy).toHaveBeenCalledWith('Redis subscriber error:', expect.any(Error));
        consoleErrorSpy.mockRestore();
     });
  });

  describe('Authentication middleware', () => {
    let useHandler;

    beforeEach(async () => {
      const { initSocketIO } = require('./socketIO');
      const mServerInstance = {
        adapter: jest.fn(),
        use: jest.fn(),
        on: jest.fn(),
        emit: jest.fn(),
      };
      require('socket.io').Server.mockImplementationOnce(() => mServerInstance);
      await initSocketIO(httpServer);
      useHandler = mServerInstance.use.mock.calls[0][0];
    });

    it('should authenticate with valid token', async () => {
      const mockSocket = {
        handshake: { auth: { token: 'valid-token' } },
      };
      const mockNext = jest.fn();

      const jwtMock = require('jsonwebtoken');
      jwtMock.verify.mockReturnValue({ sub: 'user-id-123' });

      useHandler(mockSocket, mockNext);

      expect(jwtMock.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
      expect(mockSocket.userId).toBe('user-id-123');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should authenticate with id in payload', async () => {
      const mockSocket = {
        handshake: { auth: { token: 'valid-token' } },
      };
      const mockNext = jest.fn();

      const jwtMock = require('jsonwebtoken');
      jwtMock.verify.mockReturnValue({ id: 'user-id-123' });

      useHandler(mockSocket, mockNext);

      expect(jwtMock.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
      expect(mockSocket.userId).toBe('user-id-123');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject if no token provided', async () => {
      const mockSocket = { handshake: { auth: {} } };
      const mockNext = jest.fn();

      useHandler(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toContain('No token provided');
    });

    it('should reject if token missing user id', async () => {
      const mockSocket = { handshake: { auth: { token: 'valid-token' } } };
      const mockNext = jest.fn();

      const jwtMock = require('jsonwebtoken');
      jwtMock.verify.mockReturnValue({});

      useHandler(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toContain('Invalid token');
    });

    it('should reject if jwt verify fails', async () => {
      const mockSocket = {
        handshake: { auth: { token: 'invalid-token' } },
      };
      const mockNext = jest.fn();

      const jwtMock = require('jsonwebtoken');
      jwtMock.verify.mockImplementation(() => {
        throw new Error('JWT error');
      });

      useHandler(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toContain('Invalid token');
    });
  });

  describe('getSocketIO', () => {
    it('should throw if not initialized', () => {
      const { getSocketIO } = require('./socketIO');
      expect(() => getSocketIO()).toThrow('Socket.IO not initialized');
    });
  });

  describe('getEmitter', () => {
    it('should return mock emitter if io is initialized but emitter is null', async () => {
      const { initSocketIO, getEmitter } = require('./socketIO');

      const mServerInstance = {
        adapter: jest.fn(),
        use: jest.fn(),
        on: jest.fn(),
        emit: jest.fn(),
      };
      require('socket.io').Server.mockImplementationOnce(() => mServerInstance);

      // Cause redis setup to fail to set emitter to null
      require('ioredis').mockImplementation(() => {
        throw new Error('Redis failed');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await initSocketIO(httpServer);

      const emitter = getEmitter();
      expect(emitter).toBeDefined();
      expect(emitter.emit).toBeDefined();

      emitter.emit('test-event', 'data');
      expect(mServerInstance.emit).toHaveBeenCalledWith('test-event', 'data');

      consoleErrorSpy.mockRestore();
    });

    it('should initialize standalone worker emitter if not initialized at all', () => {
      const { getEmitter } = require('./socketIO');

      const mEmitter = { emit: jest.fn() };
      require('@socket.io/redis-emitter').Emitter.mockImplementationOnce(() => mEmitter);

      const emitter = getEmitter();
      expect(emitter).toBe(mEmitter);
      expect(require('ioredis')).toHaveBeenCalled();
      expect(require('@socket.io/redis-emitter').Emitter).toHaveBeenCalled();
    });

    it('should return mock worker emitter if standalone initialization fails', () => {
       const { getEmitter } = require('./socketIO');

       require('ioredis').mockImplementationOnce(() => {
           throw new Error('Redis error');
       });

       const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

       const emitter = getEmitter();
       expect(emitter).toBeDefined();
       expect(emitter.emit).toBeDefined();

       // Just testing it doesn't crash
       emitter.emit('test', 'test');

       consoleErrorSpy.mockRestore();
    });
  });

  describe('connection handler', () => {
      it('should join user room on connection', async () => {
          const { initSocketIO } = require('./socketIO');

          const mServerInstance = {
            adapter: jest.fn(),
            use: jest.fn(),
            on: jest.fn(),
            emit: jest.fn(),
          };
          require('socket.io').Server.mockImplementationOnce(() => mServerInstance);

          await initSocketIO(httpServer);

          const connectionHandler = mServerInstance.on.mock.calls.find(call => call[0] === 'connection')[1];

          const mockSocket = {
              id: 'socket-123',
              userId: 'user-456',
              join: jest.fn(),
              on: jest.fn(),
          };

          await connectionHandler(mockSocket);

          expect(mockSocket.join).toHaveBeenCalledWith('user-456');

          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];
          expect(disconnectHandler).toBeDefined();

          // Should not crash
          disconnectHandler('transport error');
      });

      it('should not join room if no userId', async () => {
          const { initSocketIO } = require('./socketIO');

          const mServerInstance = {
            adapter: jest.fn(),
            use: jest.fn(),
            on: jest.fn(),
            emit: jest.fn(),
          };
          require('socket.io').Server.mockImplementationOnce(() => mServerInstance);

          await initSocketIO(httpServer);

          const connectionHandler = mServerInstance.on.mock.calls.find(call => call[0] === 'connection')[1];

          const mockSocket = {
              id: 'socket-123',
              join: jest.fn(),
              on: jest.fn(),
          };

          await connectionHandler(mockSocket);

          expect(mockSocket.join).not.toHaveBeenCalled();
      });
  });
});
