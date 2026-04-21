const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

// 静态文件
app.use(express.static('.'));

// 转换股票代码格式为腾讯财经格式
function convertToTencentCode(code) {
    code = code.trim();
    if (code.startsWith('sz') || code.startsWith('sh')) return code;
    if (code.includes('.')) {
        const [num, suffix] = code.split('.');
        if (suffix === 'SZ') return 'sz' + num;
        if (suffix === 'SH') return 'sh' + num;
        if (suffix === 'BJ') return 'bj' + num;
    }
    // 根据数字前缀判断
    if (code.startsWith('6')) return 'sh' + code;
    if (code.startsWith('0') || code.startsWith('3')) return 'sz' + code;
    if (code.startsWith('8') || code.startsWith('4')) return 'bj' + code;
    return 'sz' + code; // 默认
}

// 股票数据代理 API
app.get('/api/stock', async (req, res) => {
    const rawCode = req.query.code;
    if (!rawCode) return res.status(400).json({ error: '缺少股票代码' });

    try {
        const code = convertToTencentCode(rawCode);
        // 调用腾讯财经 API
        const url = `https://qt.gtimg.cn/q=${code}`;
        const response = await axios.get(url, {
            responseType: 'text',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const text = response.data;
        const match = text.match(/v_[^=]+="([^"]+)"/);
        if (!match) return res.status(500).json({ error: '数据解析失败' });

        const parts = match[1].split('~');
        if (parts.length < 45) return res.status(500).json({ error: '数据不完整' });

        const data = {
            name: parts[1],
            price: parseFloat(parts[3]),
            change: parseFloat(parts[5]),
            volume: parseFloat(parts[6]),
            turnover: parseFloat(parts[38]),
            high: parseFloat(parts[33]),
            low: parseFloat(parts[34]),
            open: parseFloat(parts[5]),
            prevClose: parseFloat(parts[4]),
            pe: parseFloat(parts[39]) || 0,
            pb: parseFloat(parts[46]) || 0,
            marketCap: parseFloat(parts[44]) || 0,
            code: code
        };

        res.json(data);
    } catch (err) {
        console.error('API Error:', err.message);
        res.status(500).json({ error: '获取数据失败: ' + err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Stock Analyzer Server running on port ${PORT}`);
});
