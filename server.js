const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
    if (!fs.existsSync(DATA_FILE)) return { problems: [], users: [], contests: [], contestParticipants: {}, contestScores: {} };
    return JSON.parse(fs.readFileSync(DATA_FILE));
}
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 初始化内置题目（同之前）
const initialProblems = [
    { id: "P1000", title: "A+B Problem", difficulty: "easy", difficultyText: "入门", passRate: "65%", timeLimit: "1.00s", memoryLimit: "125.00MB", description: "输入两个整数 a, b，输出它们的和。", inputFormat: "一行两个整数", outputFormat: "一个整数", hint: "注意范围", sampleInput: "1 2", sampleOutput: "3", testcases: [{ input: "1 2\n", output: "3" }, { input: "0 0\n", output: "0" }, { input: "-5 8\n", output: "3" }] },
    { id: "P1001", title: "A×B Problem", difficulty: "easy", difficultyText: "入门", passRate: "72%", timeLimit: "1.00s", memoryLimit: "125.00MB", description: "输入两个整数 a, b，输出乘积。", inputFormat: "一行两个整数", outputFormat: "一个整数", hint: "注意范围", sampleInput: "3 4", sampleOutput: "12", testcases: [{ input: "3 4\n", output: "12" }, { input: "0 100\n", output: "0" }, { input: "-3 5\n", output: "-15" }] },
    { id: "P1002", title: "奇偶判断", difficulty: "easy", difficultyText: "入门", passRate: "80%", timeLimit: "1.00s", memoryLimit: "125.00MB", description: "判断奇偶", inputFormat: "一个整数", outputFormat: "even 或 odd", hint: "取模", sampleInput: "5", sampleOutput: "odd", testcases: [{ input: "5\n", output: "odd" }, { input: "2\n", output: "even" }, { input: "0\n", output: "even" }] }
];

let data = readData();
if (data.problems.length === 0) data.problems = initialProblems, writeData(data);

// ---------- API 路由 ----------
app.get('/api/problems', (req, res) => { const data = readData(); res.json(data.problems); });
app.post('/api/problems', (req, res) => { const data = readData(); data.problems.push(req.body); writeData(data); res.json({ success: true }); });
app.delete('/api/problems/:id', (req, res) => { const data = readData(); data.problems = data.problems.filter(p => p.id !== req.params.id); writeData(data); res.json({ success: true }); });

app.get('/api/users', (req, res) => { const data = readData(); res.json(data.users); });
app.post('/api/users/login', (req, res) => {
    const { username } = req.body;
    const data = readData();
    let user = data.users.find(u => u.username === username);
    if (!user) {
        user = { username, totalScore: 0, continuousDays: 0, totalCheckinDays: 0, lastCheckinDate: null, createdAt: new Date().toISOString(), submissions: [] };
        data.users.push(user);
        writeData(data);
    }
    res.json(user);
});
app.post('/api/users/checkin', (req, res) => {
    const { username, today, scoreGain, newContinuous } = req.body;
    const data = readData();
    const user = data.users.find(u => u.username === username);
    if (user) {
        user.totalScore += scoreGain;
        user.continuousDays = newContinuous;
        user.totalCheckinDays += 1;
        user.lastCheckinDate = today;
        writeData(data);
        res.json(user);
    } else res.status(404).json({ error: 'User not found' });
});
app.post('/api/users/submission', (req, res) => {
    const { username, problemId, result } = req.body;
    const data = readData();
    const user = data.users.find(u => u.username === username);
    if (user) {
        user.submissions.push({ problemId, result, time: new Date().toISOString() });
        writeData(data);
        res.json(user);
    } else res.status(404).json({ error: 'User not found' });
});

app.get('/api/contests', (req, res) => { const data = readData(); res.json(data.contests); });
app.post('/api/contests', (req, res) => { const data = readData(); data.contests.push(req.body); writeData(data); res.json({ success: true }); });
app.delete('/api/contests/:id', (req, res) => { const data = readData(); data.contests = data.contests.filter(c => c.id !== req.params.id); writeData(data); res.json({ success: true }); });
app.post('/api/contests/join', (req, res) => {
    const { contestId, username } = req.body;
    const data = readData();
    if (!data.contestParticipants[contestId]) data.contestParticipants[contestId] = [];
    if (!data.contestParticipants[contestId].includes(username)) data.contestParticipants[contestId].push(username);
    writeData(data);
    res.json({ success: true });
});
app.get('/api/contests/:id/participants', (req, res) => {
    const data = readData();
    res.json(data.contestParticipants[req.params.id] || []);
});
app.post('/api/contests/score', (req, res) => {
    const { contestId, username, problemId, isAccepted } = req.body;
    const data = readData();
    if (!data.contestScores[contestId]) data.contestScores[contestId] = {};
    if (!data.contestScores[contestId][username]) data.contestScores[contestId][username] = { score: 0, solvedProblems: [] };
    const us = data.contestScores[contestId][username];
    if (isAccepted && !us.solvedProblems.includes(problemId)) {
        us.solvedProblems.push(problemId);
        us.score += 100;
        writeData(data);
    }
    res.json({ success: true });
});
app.get('/api/contests/:id/scores', (req, res) => {
    const data = readData();
    res.json(data.contestScores[req.params.id] || {});
});

// Wandbox 评测代理
app.post('/api/judge', async (req, res) => {
    const { code, language, stdin } = req.body;
    const wandboxLang = { "gcc": "gcc-head", "java": "java", "python3": "python-head" };
    const compiler = wandboxLang[language];
    if (!compiler) return res.status(400).json({ error: 'Unsupported language' });
    try {
        const resp = await fetch('https://wandbox.org/api/compile.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, stdin, compiler, options: "warning,gnu++14" })
        });
        const data = await resp.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));