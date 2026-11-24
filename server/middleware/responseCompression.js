const zlib = require('zlib');

const COMPRESSIBLE_TYPE = /^(?:application\/(?:json|javascript|xml)|text\/|image\/svg\+xml)/i;
const DEFAULT_THRESHOLD = 1024;

const parseAcceptedEncoding = (headerValue) => {
  if (typeof headerValue !== 'string' || !headerValue.trim()) return null;
  const qualities = { br: -1, gzip: -1 };
  for (const rawPart of headerValue.split(',')) {
    const [rawName, ...params] = rawPart.trim().toLowerCase().split(';');
    const name = rawName.trim();
    if (name !== 'br' && name !== 'gzip') continue;
    let q = 1;
    for (const param of params) {
      const [k, v] = param.trim().split('=');
      if (k === 'q' && v !== undefined) {
        const parsed = Number.parseFloat(v);
        if (Number.isFinite(parsed)) q = parsed;
      }
    }
    qualities[name] = Math.max(qualities[name], q);
  }
  if (qualities.br > 0 && qualities.br >= qualities.gzip) return 'br';
  if (qualities.gzip > 0) return 'gzip';
  return null;
};

const ensureStringContentType = (res, existingType) => {
  if (!existingType) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return;
  }
  if (!/;\s*charset=/i.test(existingType)) {
    res.setHeader('Content-Type', `${existingType}; charset=utf-8`);
  }
};

const responseCompression = ({ threshold = DEFAULT_THRESHOLD } = {}) => (req, res, next) => {
  if (req.method === 'HEAD') return next();
  const encoding = parseAcceptedEncoding(req.headers['accept-encoding']);
  if (!encoding) return next();

  const origSend = res.send.bind(res);

  res.send = function compressedSend(body) {
    // Only compress finalized string/Buffer payloads (res.json serializes objects to string before calling res.send).
    if ((typeof body !== 'string' && !Buffer.isBuffer(body))
      || res.headersSent
      || res.writableEnded
      || res.statusCode === 204
      || res.statusCode === 304
      || res.getHeader('Content-Encoding')) {
      return origSend(body);
    }

    const cacheControl = String(res.getHeader('Cache-Control') || '');
    if (/\bno-transform\b/i.test(cacheControl)) {
      return origSend(body);
    }

    const existingType = String(res.getHeader('Content-Type') || '');
    const contentType = existingType || (typeof body === 'string' ? 'text/html' : '');
    if (!COMPRESSIBLE_TYPE.test(contentType)) {
      return origSend(body);
    }

    res.vary('Accept-Encoding');

    const rawBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    if (rawBuffer.length < threshold) {
      return origSend(body);
    }

    const compress = encoding === 'br'
      ? (buf, cb) => zlib.brotliCompress(buf, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
      }, cb)
      : (buf, cb) => zlib.gzip(buf, { level: 6 }, cb);

    compress(rawBuffer, (err, compressed) => {
      if (res.headersSent || res.writableEnded) return;
      if (err || !compressed || compressed.length >= rawBuffer.length) {
        origSend(body);
        return;
      }
      if (typeof body === 'string') {
        ensureStringContentType(res, existingType);
      }
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Content-Length', String(compressed.length));
      res.removeHeader('ETag');
      origSend(compressed);
    });

    return res;
  };

  return next();
};

module.exports = { responseCompression, parseAcceptedEncoding };
