/* eslint-disable @typescript-eslint/no-empty-function */
import { jest } from '@jest/globals';
import nock from 'nock';
import zlib from 'zlib';
import NewRelicWinstonTransport from '../src/NewRelicWinstonTransport.js';

describe('NewRelicWinstonTransport', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should send log to New Relic API', async () => {
    const scope = nock('https://example.com').post('/logs').times(1).reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'API_KEY',
    });

    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('logged', logged);
    transport.log(data, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(scope.isDone()).toBeTruthy();
    expect(logged).toBeCalledTimes(1);
    expect(logged.mock.calls[0][0]).toEqual(data);
  });

  it('should handle HTTP request error', async () => {
    const scope = nock('https://example.com')
      .post('/logs')
      .times(1)
      .replyWithError('Request failed');
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'API_KEY',
    });

    const error = jest.fn();
    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('error', error);
    transport.on('logged', logged);
    transport.log(data, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(scope.isDone()).toBeTruthy();
    expect(logged).toBeCalledTimes(0);
    expect(error).toBeCalledTimes(1);
    expect((error.mock.calls[0][0] as any).message).toBe('Request failed');
  });

  it('should handle unexpected status code', async () => {
    const scope = nock('https://example.com').post('/logs').times(1).reply(500);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'API_KEY',
    });

    const error = jest.fn();
    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('error', error);
    transport.on('logged', logged);
    transport.log(data, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(scope.isDone()).toBeTruthy();
    expect(logged).toBeCalledTimes(0);
    expect(error).toBeCalledTimes(1);
    expect((error.mock.calls[0][0] as any).message).toBe('Received unexpected status code: 500');
  });

  it('should handle retries', async () => {
    const scopeError = nock('https://example.com').post('/logs').times(1).reply(500);
    const scopeSuccess = nock('https://example.com').post('/logs').times(1).reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'API_KEY',
      retries: 1,
    });

    const error = jest.fn();
    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('error', error);
    transport.on('logged', logged);
    transport.log(data, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(scopeError.isDone()).toBeTruthy();
    expect(scopeSuccess.isDone()).toBeTruthy();
    expect(error).toBeCalledTimes(1);
    expect(logged).toBeCalledTimes(1);
    expect((error.mock.calls[0][0] as any).message).toBe('Received unexpected status code: 500');
    expect(logged.mock.calls[0][0] as any).toEqual(data);
  });

  it('should handle max retries', async () => {
    const scope = nock('https://example.com').post('/logs').times(11).reply(500);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'API_KEY',
      retries: 10,
    });

    const error = jest.fn();
    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('error', error);
    transport.on('logged', logged);
    transport.log(data, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(scope.isDone()).toBeTruthy();
    expect(logged).toBeCalledTimes(0);
    expect(error).toBeCalledTimes(11);
    expect((error.mock.calls[0][0] as any).message).toBe('Received unexpected status code: 500');
  });

  it('should compress log when compression is enabled', async () => {
    const compressedLog = Buffer.from('compressed log');
    const gzipSpy = jest.spyOn(zlib, 'gzipSync').mockReturnValue(compressedLog);
    const scope = nock('https://example.com').post('/logs', compressedLog).reply(202, 'OK');
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      compression: true,
    });

    const error = jest.fn();
    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('error', error);
    transport.on('logged', logged);
    transport.log(data, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(gzipSpy).toHaveBeenCalledWith(JSON.stringify(data));
    expect(scope.isDone()).toBe(true);
    expect(error).toBeCalledTimes(0);
    expect(logged).toBeCalledTimes(1);
    expect(logged.mock.calls[0][0] as any).toEqual(data);
  });

  it('should handle request timeout', async () => {
    const scope = nock('https://example.com')
      .post('/logs')
      .delay(5000) // Delay the response to trigger a timeout
      .reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      timeout: 100,
    });

    const error = jest.fn();
    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('error', error);
    transport.on('logged', logged);
    transport.log(data, () => {});

    await transport.flush();

    expect(scope.isDone()).toBeTruthy();
    expect(logged).toBeCalledTimes(0);
    expect(error).toBeCalledTimes(1);
    expect((error.mock.calls[0][0] as any).message).toBe('Request timeout while sending logs');
  });

  it('should handle request retries on timeout', async () => {
    const scopeTimeout = nock('https://example.com')
      .post('/logs')
      .delay(5000) // Delay the response to trigger a timeout
      .reply(202);
    const scopeSuccess = nock('https://example.com').post('/logs').reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      timeout: 100,
      retries: 3,
    });

    const error = jest.fn();
    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('error', error);
    transport.on('logged', logged);
    transport.log(data, () => {});

    await transport.flush();

    expect(scopeTimeout.isDone()).toBeTruthy();
    expect(scopeSuccess.isDone()).toBeTruthy();
    expect(error).toBeCalledTimes(1);
    expect(logged).toBeCalledTimes(1);
    expect((error.mock.calls[0][0] as any).message).toBe('Request timeout while sending logs');
    expect(logged.mock.calls[0][0] as any).toEqual(data);
  });

  it('should handle logs without a timestamp', async () => {
    const scope = nock('https://example.com').post('/logs').reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
    });

    const error = jest.fn();
    const logged = jest.fn();
    const data = { message: 'Test log', timestamp: Date.now() };

    transport.on('error', error);
    transport.on('logged', logged);
    transport.log(data, () => {});

    await transport.flush();

    expect(scope.isDone()).toBeTruthy();
    expect(error).toBeCalledTimes(0);
    expect(logged).toBeCalledTimes(1);
    expect((logged.mock.calls[0][0] as any).timestamp).toBeDefined();
  });

  it('should flush the queue when the exact batch size is reached', async () => {
    const scope = nock('https://example.com').post('/logs').times(1).reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      batchSize: 3,
    });

    let loggedCount = 0;

    transport.on('logged', () => loggedCount++);

    transport.log({ message: 'Test log 1' }, () => {});
    transport.log({ message: 'Test log 2' }, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    // The queue should not be flushed yet
    expect(scope.isDone()).toBe(false);
    expect(loggedCount).toBe(0);
    expect(transport.queue).toHaveLength(2);

    transport.log({ message: 'Test log 3' }, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(scope.isDone()).toBe(true);
    expect(loggedCount).toBe(3);
    expect(transport.queue).toHaveLength(0);
  });

  it('should flush the queue when batch timeout is reached', async () => {
    const scope = nock('https://example.com').post('/logs').times(1).reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      batchTimeout: 500,
    });

    transport.log({ message: 'Test log 1' }, () => {});

    // The queue should not be flushed yet
    expect(scope.isDone()).toBe(false);
    expect(transport.queue.length).toBe(1);

    // Wait for batch timeout to elapse
    await new Promise(resolve => setTimeout(resolve, 600)); // Wait for 1.1 seconds

    // The queue should be flushed now after reaching the batch timeout
    expect(scope.isDone()).toBe(true);
    expect(transport.queue.length).toBe(0);
  });

  it('should reset the batch timeout when new logs are added', async () => {
    const scope = nock('https://example.com').post('/logs').times(1).reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      batchTimeout: 1000,
    });
    transport.log({ message: 'Test log 1' }, () => {});

    // The queue should not be flushed yet
    expect(scope.isDone()).toBe(false);
    expect(transport.queue.length).toBe(1);

    // Wait for half of the batch timeout
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 0.5 seconds

    transport.log({ message: 'Test log 2' }, () => {});

    // The queue should not be flushed yet
    expect(scope.isDone()).toBe(false);
    expect(transport.queue.length).toBe(2);
    expect(transport.timeout).toBeDefined();

    // Wait for the remaining half of the batch timeout
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 0.5 seconds

    // The queue should be flushed now after reaching the batch timeout
    expect(scope.isDone()).toBe(true);
    expect(transport.queue.length).toBe(0);
    expect(transport.timeout).toBeUndefined();
  });

  it('should flush the queue on _final', done => {
    const scope = nock('https://example.com').post('/logs').reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      batchSize: 10,
    });

    transport.log({ message: 'Test log' }, () => {
      // Perform assertions before calling _final
      expect(scope.isDone()).toBe(false);
      expect(transport.queue.length).toBe(1);

      transport._final(error => {
        expect(error).toBeNull();
        expect(scope.isDone()).toBe(true);
        expect(transport.queue.length).toBe(0);
        done();
      });
    });
  });

  it('should flush the queue when batch size or timeout is reached', async () => {
    let scope = nock('https://example.com').post('/logs').times(1).reply(202);

    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      batchSize: 2, // Set batch size to 2 for testing
      batchTimeout: 1000, // Set batch timeout to 1 second for testing
    });

    transport.log({ message: 'Test log 1' }, () => {});

    // The queue should not be flushed yet
    expect(scope.isDone()).toBe(false);
    expect(transport.queue.length).toBe(1);

    // Wait for batch timeout to elapse
    await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for 1.1 seconds

    // The queue should be flushed now after reaching the batch timeout
    expect(scope.isDone()).toBe(true);
    expect(transport.queue.length).toBe(0);

    // Reset the scope for the second part of the test
    scope.done();
    scope = nock('https://example.com').post('/logs').times(1).reply(202);

    transport.log({ message: 'Test log 2' }, () => {});

    // The queue should not be flushed yet
    expect(scope.isDone()).toBe(false);
    expect(transport.queue.length).toBe(1);

    // Wait for half of the batch timeout
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 0.5 seconds

    transport.log({ message: 'Test log 3' }, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    // The queue should be flushed now after reaching the batch size
    expect(scope.isDone()).toBe(true);
    expect(transport.queue.length).toBe(0);
  });

  it('should flush the queue and resolve _final without error', async () => {
    const scope = nock('https://example.com').post('/logs').reply(202);
    const transport = new NewRelicWinstonTransport({
      apiUrl: 'https://example.com/logs',
      apiKey: 'YOUR_API_KEY',
      batchSize: 10,
    });

    transport.log({ message: 'Test log 1' }, () => {});
    transport.log({ message: 'Test log 2' }, () => {});
    transport.log({ message: 'Test log 3' }, () => {});

    expect(scope.isDone()).toBe(false);
    expect(transport.queue.length).toBe(3);

    await transport.flush();

    expect(scope.isDone()).toBe(true);
    expect(transport.queue.length).toBe(0);
  });
});
