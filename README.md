# Winston New Relic Transport

[![NPM Version](https://img.shields.io/npm/v/winston-nr.svg)](https://www.npmjs.com/package/winston-nr) [![License](https://img.shields.io/npm/l/winston-nr.svg)](https://github.com/your-username/winston-nr/blob/main/LICENSE) [![Coverage Status](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](https://github.com/your-username/winston-nr)

A simple, lightweight, and easy-to-use custom transport for Winston logger that exports logs to New Relic using HTTP requests. This library has no external dependencies, ensuring a lightweight and minimalistic solution.

## Features

- Simple and lightweight library with no external dependencies.
- Custom transport for exporting logs to New Relic using HTTP requests.
- Easy integration with your existing Winston logger configuration.
- Supports compression of log payloads to optimize network utilization.
- Optional batching of logs for efficient transmission to the New Relic Logs API.
- Fine-grained control over batch size and batch timeout for optimal log handling.
- Full unit test coverage for reliable and robust functionality.
- Provides a `flush` method to manually flush the transport and ensure all logs are sent.
- Written in TypeScript for enhanced type safety and editor support.

## Installation

```bash
npm install winston-nr
```

## Usage

```js
import winston from 'winston';
import NewRelicTransport from 'winston-nr';

// Create the transport and a Winston logger instance and
const nrTransport = new NewRelicTransport({
  apiUrl: 'https://log-api.newrelic.com/log/v1',
  apiKey: 'YOUR_API_KEY',
  compression: true,
  retries: 3,
  batchSize: 10,
  batchTimeout: 5000,
});
const logger = winston.createLogger({
  transports: [nrTransport],
});

// Log a message
logger.info('Log message', { test: true });

// Manually flush the transport to ensure all logs are sent
await nrTransport.flush();
// Or, automatically trigger the flush by ending the logger
await new Promise(resolve =>
  logger.on('error', resolve).on('close', resolve).on('finish', logger.close)
);
logger.end();

// You can safely exit the app without losing your logs
process.exit(0);
```

## Options

The `NewRelicTransport` accepts the following options:

- `apiUrl` (required): The URL of the New Relic Logs API.
- `apiKey` (required): The API key used to authenticate with the New Relic Logs API.
- `timeout`: Timeout for the HTTP request in milliseconds (default: 5000).
- `retries`: Number of times to retry failed requests (default: 0).
- `compression`: Enable gzip compression for the log payload (default: false).
- `batchSize`: Number of logs to batch together before sending.
- `batchTimeout`: Time interval in milliseconds to wait for batching logs.

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request.
