const http = require('http');
const data = JSON.stringify({ url: 'https://www.youtube.com/watch?v=_a_mP8UAu8g' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/download',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', res.headers);
  res.setEncoding('utf8');
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('BODY:', body.slice(0, 1000));
  });
});

req.on('error', (e) => { console.error('problem with request:', e); });

req.write(data);
req.end();
