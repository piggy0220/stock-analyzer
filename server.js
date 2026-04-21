const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.static('.'));

function containsChinese(str) {
    return /[\u4e00-\u9fa5]/.test(str);
}

async function searchStockCodeByName(name) {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(name)}&type=14&count=5`;
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
    });
    
    const data = response.data;
    if (data?.QuotationCodeTable?.Data?.length > 0) {
        const stock = data.QuotationCodeTable.Data[0];
        const market = (stock.JYS === '1' || stock.JYS === '2') ? 'SH' : 'SZ';
        return { code: stock.Code, name: stock.Name, market };
    }
    return null;
}

function convertToTencentCode(code) {
    code = code.trim();
    if (code.startsWith('sz') || code.startsWith('sh')) return code;
    if (code.includes('.')) {
        const [num, suffix] = code.split('.');
        if (suffix === 'SZ') return 'sz' + num;
        if (suffix === 'SH') return 'sh' + num;
        if (suffix === 'BJ') return 'bj' + num;
    }
    if (code.startsWith('6')) return 'sh' + code;
    if (code.startsWith('0') || code.startsWith('3')) return 'sz' + code;
    if (code.startsWith('8') || code.startsWith('4')) return 'bj' + code;
    return 'sz' + code;
}

// ========== 技术指标计算 ==========

function calculateEMA(arr, period) {
    const k = 2 / (period + 1);
    const ema = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
        ema.push(arr[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calculateMACD(closes) {
    if (closes.length < 35) return null;
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const dif = ema12.map((v, i) => v - ema26[i]);
    const dea = calculateEMA(dif, 9);
    const macd = dif.map((v, i) => 2 * (v - dea[i]));
    
    const signals = [];
    for (let i = 1; i < dif.length; i++) {
        if (dif[i - 1] < dea[i - 1] && dif[i] >= dea[i]) {
            signals.push({ index: i, type: 'golden', label: 'MACD金叉' });
        } else if (dif[i - 1] > dea[i - 1] && dif[i] <= dea[i]) {
            signals.push({ index: i, type: 'death', label: 'MACD死叉' });
        }
    }
    
    return { dif, dea, macd, signals };
}

function calculateKDJ(highs, lows, closes) {
    if (closes.length < 9) return null;
    const period = 9;
    const rsvs = [];
    for (let i = period - 1; i < closes.length; i++) {
        const hh = Math.max(...highs.slice(i - period + 1, i + 1));
        const ll = Math.min(...lows.slice(i - period + 1, i + 1));
        rsvs.push(hh === ll ? 50 : (closes[i] - ll) / (hh - ll) * 100);
    }
    
    let k = 50, d = 50;
    const ks = [], ds = [], js = [];
    for (const rsv of rsvs) {
        k = (2 * k + rsv) / 3;
        d = (2 * d + k) / 3;
        const j = 3 * k - 2 * d;
        ks.push(k);
        ds.push(d);
        js.push(j);
    }
    
    const signals = [];
    for (let i = 1; i < ks.length; i++) {
        if (ks[i - 1] < ds[i - 1] && ks[i] >= ds[i]) {
            signals.push({ index: i + period - 1, type: 'golden', label: 'KDJ金叉' });
        } else if (ks[i - 1] > ds[i - 1] && ks[i] <= ds[i]) {
            signals.push({ index: i + period - 1, type: 'death', label: 'KDJ死叉' });
        }
    }
    
    // 补齐前面的空值
    const prefix = Array(period - 1).fill(null);
    return {
        k: [...prefix, ...ks],
        d: [...prefix, ...ds],
        j: [...prefix, ...js],
        signals
    };
}

function calculateVolumeSignals(volumes, closes) {
    const signals = [];
    const avg20 = [];
    for (let i = 0; i < volumes.length; i++) {
        const start = Math.max(0, i - 19);
        const slice = volumes.slice(start, i + 1);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        avg20.push(avg);
        
        if (i >= 5) {
            const prevAvg = avg20[i - 1];
            if (volumes[i] > prevAvg * 1.5 && volumes[i - 1] <= prevAvg * 1.5) {
                signals.push({ index: i, type: 'volume_up', label: '放量' });
            } else if (volumes[i] < prevAvg * 0.5 && volumes[i - 1] >= prevAvg * 0.5) {
                signals.push({ index: i, type: 'volume_down', label: '缩量' });
            }
        }
    }
    return { avg20, signals };
}

// ========== API ==========

app.get('/api/stock', async (req, res) => {
    const rawCode = req.query.code;
    if (!rawCode) return res.status(400).json({ error: '缺少股票代码或名称' });

    try {
        let stockCode = rawCode;
        let stockName = null;
        
        if (containsChinese(rawCode)) {
            const searchResult = await searchStockCodeByName(rawCode);
            if (!searchResult) return res.status(404).json({ error: '未找到该股票' });
            stockCode = searchResult.code + '.' + searchResult.market;
            stockName = searchResult.name;
        }
        
        const code = convertToTencentCode(stockCode);
        const url = `https://qt.gtimg.cn/q=${code}`;
        const response = await axios.get(url, {
            responseType: 'text',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
        });

        const text = response.data;
        const match = text.match(/v_[^=]+="([^"]+)"/);
        if (!match) return res.status(500).json({ error: '数据解析失败' });

        const parts = match[1].split('~');
        if (parts.length < 45) return res.status(500).json({ error: '数据不完整' });

        const data = {
            name: stockName || parts[1],
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

app.get('/api/kline', async (req, res) => {
    const { code, period = 'day' } = req.query;
    if (!code) return res.status(400).json({ error: '缺少股票代码' });

    try {
        const tencentCode = convertToTencentCode(code);
        
        if (period === 'minute') {
            const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${tencentCode}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
            
            const rawData = response.data.data[tencentCode].data.data;
            const minuteData = rawData.map(item => {
                const [time, price, volume, amount] = item.split(' ');
                return {
                    time: time.substring(0, 2) + ':' + time.substring(2),
                    price: parseFloat(price),
                    volume: parseInt(volume),
                    amount: parseFloat(amount)
                };
            });
            
            res.json({ period: 'minute', data: minuteData });
            
        } else if (period === '5day') {
            const today = new Date();
            const dates = [];
            let daysBack = 0;
            while (dates.length < 5) {
                const d = new Date(today);
                d.setDate(d.getDate() - daysBack);
                const dayOfWeek = d.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                }
                daysBack++;
                if (daysBack > 15) break;
            }
            
            const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},day,${dates[dates.length-1]},${dates[0]},5,qfq`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
            
            const rawData = response.data.data[tencentCode]['qfqday'] || [];
            const klineData = rawData.map(item => ({
                date: item[0],
                open: parseFloat(item[1]),
                close: parseFloat(item[2]),
                high: parseFloat(item[3]),
                low: parseFloat(item[4]),
                volume: parseFloat(item[5])
            }));
            
            res.json({ period: '5day', data: klineData });
            
        } else {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 2);
            
            const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;
            const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
            
            const periodMap = { day: 'day', week: 'week', month: 'month' };
            const periodKey = { day: 'qfqday', week: 'qfqweek', month: 'qfqmonth' };
            
            const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},${periodMap[period]},${startStr},${endStr},500,qfq`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000
            });
            
            const rawData = response.data.data[tencentCode][periodKey[period]] || [];
            let klineData = rawData.map(item => ({
                date: item[0],
                open: parseFloat(item[1]),
                close: parseFloat(item[2]),
                high: parseFloat(item[3]),
                low: parseFloat(item[4]),
                volume: parseFloat(item[5])
            }));
            
            // 补充当天实时数据
            if (period === 'day') {
                try {
                    const todayStr = endStr;
                    const lastDate = klineData.length > 0 ? klineData[klineData.length - 1].date : null;
                    
                    if (lastDate !== todayStr) {
                        const realtimeUrl = `https://qt.gtimg.cn/q=${tencentCode}`;
                        const rtResponse = await axios.get(realtimeUrl, {
                            responseType: 'text',
                            headers: { 'User-Agent': 'Mozilla/5.0' },
                            timeout: 5000
                        });
                        
                        const match = rtResponse.data.match(/v_[^=]+="([^"]+)"/);
                        if (match) {
                            const parts = match[1].split('~');
                            if (parts.length >= 45) {
                                klineData.push({
                                    date: todayStr,
                                    open: parseFloat(parts[5]),
                                    close: parseFloat(parts[3]),
                                    high: parseFloat(parts[33]),
                                    low: parseFloat(parts[34]),
                                    volume: parseFloat(parts[6])
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.log('补充实时数据失败:', e.message);
                }
            }
            
            // 计算技术指标
            const closes = klineData.map(d => d.close);
            const highs = klineData.map(d => d.high);
            const lows = klineData.map(d => d.low);
            const volumes = klineData.map(d => d.volume);
            
            const macd = calculateMACD(closes);
            const kdj = calculateKDJ(highs, lows, closes);
            const volAnalysis = calculateVolumeSignals(volumes, closes);
            
            // 合并所有信号
            const allSignals = [];
            if (macd) {
                macd.signals.forEach(s => allSignals.push({ ...s, indicator: 'MACD' }));
            }
            if (kdj) {
                kdj.signals.forEach(s => allSignals.push({ ...s, indicator: 'KDJ' }));
            }
            if (volAnalysis) {
                volAnalysis.signals.forEach(s => allSignals.push({ ...s, indicator: 'VOL' }));
            }
            
            res.json({
                period,
                data: klineData,
                macd: macd ? { dif: macd.dif, dea: macd.dea, macd: macd.macd } : null,
                kdj: kdj ? { k: kdj.k, d: kdj.d, j: kdj.j } : null,
                volumeAvg: volAnalysis ? volAnalysis.avg20 : null,
                signals: allSignals
            });
        }
    } catch (err) {
        console.error('Kline API Error:', err.message);
        res.status(500).json({ error: '获取K线数据失败: ' + err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Stock Analyzer Server running on port ${PORT}`);
});
