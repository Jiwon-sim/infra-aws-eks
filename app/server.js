const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { nanoid } = require('nanoid');
const app = express();
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// 메모리 기반 저장소 (Redis 대신)
const urlStore = new Map();
const useRedis = REDIS_URL !== 'memory';

let client = null;
if (useRedis) {
  const redis = require('redis');
  client = redis.createClient({ url: REDIS_URL });
  client.on('error', (err) => console.log('Redis Client Error', err));
}

// 미들웨어
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 메인 페이지
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>URL Shortener</title></head>
      <body>
        <h1>URL Shortener Service</h1>
        <form action="/shorten" method="post">
          <input type="url" name="url" placeholder="Enter URL to shorten" required>
          <button type="submit">Shorten</button>
        </form>
      </body>
    </html>
  `);
});

// URL 단축
app.post('/shorten', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    
    const shortId = nanoid(8);
    
    if (useRedis) {
      await client.setEx(shortId, 86400 * 30, url);
    } else {
      urlStore.set(shortId, url);
    }
    
    const shortUrl = `${req.protocol}://${req.get('host')}/${shortId}`;
    res.json({ shortUrl, originalUrl: url, shortId });
  } catch (error) {
    console.error('Error shortening URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// URL 리다이렉트
app.get('/:shortId', async (req, res) => {
  try {
    const { shortId } = req.params;
    const originalUrl = useRedis ? await client.get(shortId) : urlStore.get(shortId);
    
    if (!originalUrl) {
      return res.status(404).json({ error: 'Short URL not found' });
    }
    
    res.redirect(originalUrl);
  } catch (error) {
    console.error('Error redirecting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// URL 유효성 검사
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// 서버 시작
async function startServer() {
  try {
    if (useRedis) {
      await client.connect();
      console.log('Connected to Redis');
    } else {
      console.log('Using in-memory storage');
    }
    
    app.listen(PORT, () => {
      console.log(`URL Shortener running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();