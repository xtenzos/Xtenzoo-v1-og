const express = require('express');
const { fork } = require('child_process');
const path = require('path');
const multer = require('multer');
const http = require('http');
const localtunnel = require('localtunnel');
const { Client } = require('discord.js-selfbot-v13');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let userTokens = [];
let workers = [];
let accountTags = {};

function spawnWorkersForTokens() {
    workers.forEach(w => { try { w.kill(); } catch(e){} });
    workers = [];
    accountTags = {};

    userTokens.forEach((token, index) => {
        const accId = index + 1;
        const worker = fork(path.join(__dirname, 'worker.js'), {
            env: {
                ...process.env,
                ACCOUNT_ID: accId,
                DISCORD_TOKEN: token
            },
            execArgv: ['--max-old-space-size=128']
        });

        worker.on('message', (msg) => {
            if (msg.type === 'ready') {
                accountTags[accId] = msg.tag;
            }
        });

        worker.on('exit', () => {
            delete accountTags[accId];
        });

        workers.push(worker);
    });
}

app.post('/api/login-tokens', (req, res) => {
    let { tokens } = req.body;
    if (!tokens) return res.status(400).json({ error: 'No tokens provided' });

    userTokens = tokens.split(/[\r\n,]+/).map(t => t.trim()).filter(t => t.length > 10);
    if (userTokens.length === 0) return res.status(400).json({ error: 'Invalid tokens format' });

    spawnWorkersForTokens();
    res.json({ success: true, message: 'Successfully loaded accounts!' });
});

app.get('/api/accounts', (req, res) => {
    res.json(accountTags);
});

app.get('/api/guilds', async (req, res) => {
    try {
        if (userTokens.length === 0) return res.json([]);
        const tempClient = new Client({ checkUpdate: false });
        await tempClient.login(userTokens[0]);
        const fetchedGuilds = tempClient.guilds.cache.map(g => ({ id: g.id, name: g.name }));
        tempClient.destroy();
        res.json(fetchedGuilds);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch guild list' });
    }
});

app.get('/api/channels/:guildId', async (req, res) => {
    try {
        if (userTokens.length === 0) return res.json([]);
        const tempClient = new Client({ checkUpdate: false });
        await tempClient.login(userTokens[0]);
        const guild = await tempClient.guilds.fetch(req.params.guildId);
        const channels = await guild.channels.fetch();
        const voiceChannels = channels
            .filter(c => c && (c.type === 'GUILD_VOICE' || c.type === 'GUILD_STAGE_VOICE' || c.type === 2 || c.type === 13))
            .map(c => ({ id: c.id, name: c.name }));
        tempClient.destroy();
        res.json(voiceChannels);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

app.post('/api/play', upload.single('audioFile'), (req, res) => {
    const { guildId, channelId, accountCount, loop, gain, bass, air } = req.body;
    let audioUrl = req.file ? req.file.path : req.body.audioUrl;

    if (!guildId || !channelId || !audioUrl) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const count = accountCount === 'all' ? workers.length : parseInt(accountCount) || 1;
    const activeWorkers = workers.slice(0, count);

    activeWorkers.forEach(worker => {
        if (worker.connected) {
            worker.send({ action: 'join', guildId, channelId, audioUrl, loop: loop === 'true', gain, bass, air });
        }
    });

    res.json({ success: true, message: 'Dispatched stream.' });
});

app.post('/api/sync', (req, res) => {
    workers.forEach(w => { if (w.connected) w.send({ action: 'sync' }); });
    res.json({ success: true, message: 'Synced.' });
});
app.post('/api/boost', (req, res) => {
    workers.forEach(w => { if (w.connected) w.send({ action: 'boost' }); });
    res.json({ success: true, message: 'Boosted.' });
});
app.post('/api/earbreak', (req, res) => {
    workers.forEach(w => { if (w.connected) w.send({ action: 'earbreak' }); });
    res.json({ success: true, message: 'Earbreak.' });
});
app.post('/api/heavyair', (req, res) => {
    workers.forEach(w => { if (w.connected) w.send({ action: 'heavyair' }); });
    res.json({ success: true, message: 'Heavy air.' });
});
app.post('/api/pause', (req, res) => {
    workers.forEach(w => { if (w.connected) w.send({ action: 'pause' }); });
    res.json({ success: true, message: 'Paused.' });
});
app.post('/api/resume', (req, res) => {
    workers.forEach(w => { if (w.connected) w.send({ action: 'resume' }); });
    res.json({ success: true, message: 'Resumed.' });
});
app.post('/api/disconnect', (req, res) => {
    workers.forEach(w => { if (w.connected) w.send({ action: 'disconnect' }); });
    res.json({ success: true, message: 'Disconnected.' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, async () => {
    console.log(`[Amplifier Master] Running locally on http://localhost:${PORT}`);
    try {
        const tunnel = await localtunnel({ port: PORT });
        console.log(`\n==================================================`);
        console.log(`🚀 SHARE THIS LIVE LINK WITH YOUR FRIENDS:`);
        console.log(`👉 ${tunnel.url}`);
        console.log(`==================================================\n`);
    } catch (err) {
        console.log('Tunnel error:', err);
    }
});
  
