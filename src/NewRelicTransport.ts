import WinstonTransport, { TransportStreamOptions } from 'winston-transport';
import { URL } from 'url';
import zlib from 'zlib';
import http from 'http';
import https from 'https';

type NewRelicTransportOptions = TransportStreamOptions & {
  apiUrl: string;
  apiKey: string;
  timeout?: number;
  retries?: number;
  compression?: boolean;
  batchSize?: number;
  batchTimeout?: number;
};

class NewRelicTransport extends WinstonTransport {
  public static DEFAULT_TIMEOUT = 5000;
  public static EXPECTED_STATUS_CODE = 202;

  public https: boolean;
  public request: http.RequestOptions;
  public promises = new Set<Promise<Error | void>>();
  public batch: boolean;
  public queue = new Array<any>();
  public timeout?: NodeJS.Timeout;

  constructor(public options: NewRelicTransportOptions) {
    super(options);

    const url = new URL(options.apiUrl);
    this.https = url.protocol === 'https:';
    this.batch = !!(
      (options.batchSize && options.batchSize > 1) ||
      (options.batchTimeout && options.batchTimeout > 0)
    );
    this.request = {
      method: 'POST',
      host: url.host,
      port: url.port,
      path: url.pathname,
      timeout: options.timeout || NewRelicTransport.DEFAULT_TIMEOUT,
      headers: {
        'Api-Key': options.apiKey,
        'Content-Type': 'application/json',
      },
    };

    if (this.options.compression) {
      this.request.headers!['Content-Encoding'] = 'gzip';
    }
  }

  private _sendRequest(data: any | any[], retries = 0) {
    const promise = new Promise<Error | void>(resolve => {
      const request = (this.https ? https : http).request(this.request);

      request
        .on('response', response => {
          response
            .on('end', () => {
              if (response.statusCode !== NewRelicTransport.EXPECTED_STATUS_CODE) {
                if (this.options.retries && this.options.retries > retries) {
                  this._sendRequest(data, retries + 1);
                }

                resolve(new Error(`Received unexpected status code: ${response.statusCode || 0}`));
              } else {
                resolve();
              }
            })
            .resume();
        })
        .on('error', error => {
          if (this.options.retries && this.options.retries > retries) {
            this._sendRequest(data, retries + 1);
          }

          resolve(error);
        })
        .on('timeout', () => {
          request.destroy(new Error(`Request timeout while sending logs`));
        })
        .end(
          this.options.compression
            ? zlib.gzipSync(JSON.stringify(data))
            : Buffer.from(JSON.stringify(data), 'utf8')
        );
    });

    this.promises.add(promise);

    promise
      .then(error =>
        error
          ? void this.emit('error', error)
          : (Array.isArray(data) ? data : [data]).forEach(info => this.emit('logged', info))
      )
      .finally(() => this.promises.delete(promise));
  }

  private _pushQueue(info: any) {
    const queued = this.queue.push(info);

    if (queued >= (this.options.batchSize || Number.MAX_SAFE_INTEGER)) {
      this._flushQueue();
    } else {
      if (this.options.batchTimeout && !this.timeout) {
        this.timeout = setTimeout(() => this._flushQueue(), this.options.batchTimeout);
      }
    }
  }

  private _flushQueue() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    const infos = this.queue.slice();
    this.queue = [];

    if (!infos.length) return 0;

    this._sendRequest(infos);

    return infos.length;
  }

  public _final(callback: (error?: Error | null) => void) {
    this._flushQueue();
    void this.flush().then(() => callback(null));
  }

  public log(info: any, callback: () => void) {
    if (typeof info.timestamp !== 'number') info.timestamp = Date.now();

    if (this.batch) {
      this._pushQueue(info);
    } else {
      this._sendRequest(info);
    }

    callback();
  }

  public async flush(): Promise<void> {
    if (this._flushQueue() || this.promises.size) {
      await Promise.all(this.promises);
      await this.flush();
    }
  }
}

export default NewRelicTransport;
