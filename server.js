const express = require('express');
const axios = require('axios');
const path = require('path');
const iconv = require('iconv-lite');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.static('.', {
    setHeaders: (res, path) => {
        if (path.endsWith('.html') || path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// 常见股票别名映射（简称 -> 正式名称）
const STOCK_ALIASES = {
    '讯飞科技': '科大讯飞',
    '讯飞': '科大讯飞',
    '茅台': '贵州茅台',
    '五粮液': '五粮液',
    '腾讯': '腾讯控股',
    '阿里': '阿里巴巴',
    '比亚迪': '比亚迪',
    '宁德时代': '宁德时代',
    '中芯国际': '中芯国际',
    '中信证券': '中信证券',
    '中国平安': '中国平安',
    '招商银行': '招商银行',
    '海康威视': '海康威视',
    '美的集团': '美的集团',
    '格力电器': '格力电器',
    '恒瑞医药': '恒瑞医药',
    '隆基绿能': '隆基绿能',
    '通威股份': '通威股份',
    '药明康德': '药明康德',
    '立讯精密': '立讯精密',
    '工业富联': '工业富联',
    '迈瑞医疗': '迈瑞医疗',
    '三一重工': '三一重工',
    '海尔智家': '海尔智家',
    '顺丰控股': '顺丰控股',
    '伊利股份': '伊利股份',
    '海天味业': '海天味业',
    '中国中免': '中国中免',
    '金龙鱼': '金龙鱼',
    '中石油': '中国石油',
    '中石化': '中国石化',
    '中国移动': '中国移动',
    '中国电信': '中国电信',
    '中国联通': '中国联通',
    '工商银行': '工商银行',
    '建设银行': '建设银行',
    '农业银行': '农业银行',
    '中国银行': '中国银行',
    '交通银行': '交通银行',
    '邮储银行': '邮储银行',
    '兴业银行': '兴业银行',
    '浦发银行': '浦发银行',
    '民生银行': '民生银行',
    '光大银行': '光大银行',
    '中信银行': '中信银行',
    '华夏银行': '华夏银行',
    '北京银行': '北京银行',
    '上海银行': '上海银行',
    '江苏银行': '江苏银行',
    '南京银行': '南京银行',
    '宁波银行': '宁波银行',
    '杭州银行': '杭州银行',
    '成都银行': '成都银行',
    '长沙银行': '长沙银行',
    '贵阳银行': '贵阳银行',
    '重庆银行': '重庆银行',
    '齐鲁银行': '齐鲁银行',
    '青岛银行': '青岛银行',
    '苏州银行': '苏州银行',
    '西安银行': '西安银行',
    '厦门银行': '厦门银行',
    '兰州银行': '兰州银行',
    '郑州银行': '郑州银行',
    '天津银行': '天津银行',
    '哈尔滨银行': '哈尔滨银行',
    '盛京银行': '盛京银行',
    '锦州银行': '锦州银行',
    '九江银行': '九江银行',
    '泸州银行': '泸州银行',
    '晋商银行': '晋商银行',
    '九江银行': '九江银行',
    '中原银行': '中原银行',
    '贵州银行': '贵州银行',
    '甘肃银行': '甘肃银行',
    '江西银行': '江西银行',
    '威海银行': '威海银行',
    '东莞银行': '东莞银行',
    '广东华兴银行': '广东华兴银行',
    '华润银行': '华润银行',
    '恒逸石化': '恒逸石化',
    '南海农商': '南海农商银行',
    '顺德农商': '顺德农商银行',
    '江门农商': '江门农商银行',
    '佛山农商': '佛山农商银行',
    '东莞农商': '东莞农商银行',
    '深圳农商': '深圳农商银行',
    '广州农商': '广州农商银行',
    '珠海农商': '珠海农商银行',
    '惠州农商': '惠州农商银行',
    '肇庆农商': '肇庆农商银行',
    '清远农商': '清远农商银行',
    '梅州农商': '梅州农商银行',
    '汕头农商': '汕头农商银行',
    '揭阳农商': '揭阳农商银行',
    '潮州农商': '潮州农商银行',
    '汕尾农商': '汕尾农商银行',
    '阳江农商': '阳江农商银行',
    '茂名农商': '茂名农商银行',
    '湛江农商': '湛江农商银行',
    '云浮农商': '云浮农商银行',
    '河源农商': '河源农商银行',
    '韶关农商': '韶关农商银行',
};

function resolveStockAlias(name) {
    return STOCK_ALIASES[name] || name;
}

function containsChinese(str) {
    return /[\u4e00-\u9fa5]/.test(str);
}

async function searchStockCodeByName(name) {
    // 先尝试东方财富
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
    
    // 备用1：腾讯证券搜索
    try {
        const tencentSearchUrl = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(name)}&t=all`;
        const tencentRes = await axios.get(tencentSearchUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const tencentText = iconv.decode(tencentRes.data, 'gbk');
        const match = tencentText.match(/v_hint="([^"]+)"/);
        if (match && match[1] !== 'N') {
            const items = match[1].split('^');
            for (const item of items) {
                const parts = item.split('~');
                if (parts.length >= 4) {
                    let code = parts[1];
                    const stockName = parts[2];
                    const type = parts[0];
                    if (type === 'stock' && code) {
                        let market = 'SZ';
                        if (code.startsWith('6')) market = 'SH';
                        return { code, name: stockName, market };
                    }
                }
            }
        }
    } catch (e) {
        console.log('腾讯搜索备用失败:', e.message);
    }
    
    // 备用2：同花顺搜索（支持模糊匹配/简称）
    try {
        const thsUrl = `https://searchapi.10jqka.com.cn/stockpick/search?type=1&tid=stockpick&w=${encodeURIComponent(name)}`;
        const thsRes = await axios.get(thsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://stockpage.10jqka.com.cn/' },
            timeout: 10000
        });
        const thsData = thsRes.data;
        if (thsData?.data?.length > 0) {
            const stock = thsData.data[0];
            let code = stock.code || stock.stockcode;
            const stockName = stock.name || stock.stockname;
            if (code && stockName) {
                let market = 'SZ';
                if (code.startsWith('6')) market = 'SH';
                return { code, name: stockName, market };
            }
        }
    } catch (e) {
        console.log('同花顺搜索备用失败:', e.message);
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

function getPureCode(tencentCode) {
    return tencentCode.replace(/^(sz|sh|bj)/, '');
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
    
    const prefix = Array(period - 1).fill(null);
    return { k: [...prefix, ...ks], d: [...prefix, ...ds], j: [...prefix, ...js], signals };
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

function calculateBOLL(closes, period = 20, k = 2) {
    if (closes.length < period) return null;
    const mb = [];  // 中轨 = MA20
    const up = [];  // 上轨
    const dn = [];  // 下轨
    
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            mb.push(null);
            up.push(null);
            dn.push(null);
        } else {
            const slice = closes.slice(i - period + 1, i + 1);
            const avg = slice.reduce((a, b) => a + b, 0) / period;
            const variance = slice.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / period;
            const std = Math.sqrt(variance);
            mb.push(avg);
            up.push(avg + k * std);
            dn.push(avg - k * std);
        }
    }
    
    // 生成信号
    const signals = [];
    const last = closes.length - 1;
    if (closes[last] > up[last]) {
        signals.push({ index: last, type: 'boll_upper', label: '触及上轨', indicator: 'BOLL' });
    } else if (closes[last] < dn[last]) {
        signals.push({ index: last, type: 'boll_lower', label: '触及下轨', indicator: 'BOLL' });
    }
    
    return { mb, up, dn, signals };
}

// ========== DMI计算 ==========

function calculateDMI(highs, lows, closes) {
    if (highs.length < 15) return null;
    
    const period = 14;
    const n = highs.length;
    
    // 原始DM和TR
    const plusDM = [0];
    const minusDM = [0];
    const tr = [0];
    
    for (let i = 1; i < n; i++) {
        const upMove = highs[i] - highs[i - 1];
        const downMove = lows[i - 1] - lows[i];
        
        if (upMove > downMove && upMove > 0) {
            plusDM.push(upMove);
            minusDM.push(0);
        } else if (downMove > upMove && downMove > 0) {
            plusDM.push(0);
            minusDM.push(downMove);
        } else {
            plusDM.push(0);
            minusDM.push(0);
        }
        
        const trueRange = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
        tr.push(trueRange);
    }
    
    // 平滑（Wilder平滑法）
    const smoothPlusDM = [];
    const smoothMinusDM = [];
    const smoothTR = [];
    
    // 初始值：前period个的和
    let sumPlusDM = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
    let sumMinusDM = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
    let sumTR = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
    
    for (let i = 0; i < n; i++) {
        if (i < period) {
            smoothPlusDM.push(null);
            smoothMinusDM.push(null);
            smoothTR.push(null);
        } else if (i === period) {
            smoothPlusDM.push(sumPlusDM);
            smoothMinusDM.push(sumMinusDM);
            smoothTR.push(sumTR);
        } else {
            sumPlusDM = sumPlusDM - sumPlusDM / period + plusDM[i];
            sumMinusDM = sumMinusDM - sumMinusDM / period + minusDM[i];
            sumTR = sumTR - sumTR / period + tr[i];
            smoothPlusDM.push(sumPlusDM);
            smoothMinusDM.push(sumMinusDM);
            smoothTR.push(sumTR);
        }
    }
    
    // DI
    const plusDI = [];
    const minusDI = [];
    const dx = [];
    
    for (let i = 0; i < n; i++) {
        if (smoothTR[i] === null || smoothTR[i] === 0) {
            plusDI.push(null);
            minusDI.push(null);
            dx.push(null);
        } else {
            const pdi = smoothPlusDM[i] / smoothTR[i] * 100;
            const mdi = smoothMinusDM[i] / smoothTR[i] * 100;
            plusDI.push(pdi);
            minusDI.push(mdi);
            dx.push(Math.abs(pdi - mdi) / (pdi + mdi) * 100);
        }
    }
    
    // ADX（DX的平滑）
    const adx = [];
    let adxSum = 0;
    let adxCount = 0;
    
    for (let i = 0; i < n; i++) {
        if (dx[i] === null) {
            adx.push(null);
        } else if (adxCount < period) {
            adxSum += dx[i];
            adxCount++;
            if (adxCount === period) {
                const firstAdx = adxSum / period;
                // 回填
                for (let j = i - period + 1; j <= i; j++) {
                    adx[j] = firstAdx;
                }
            } else {
                adx.push(null);
            }
        } else {
            const newAdx = (adx[i - 1] * (period - 1) + dx[i]) / period;
            adx.push(newAdx);
        }
    }
    
    // 信号
    const signals = [];
    for (let i = 1; i < n; i++) {
        if (plusDI[i - 1] !== null && plusDI[i] !== null && minusDI[i - 1] !== null && minusDI[i] !== null) {
            if (plusDI[i - 1] <= minusDI[i - 1] && plusDI[i] > minusDI[i]) {
                signals.push({ index: i, type: 'golden', label: 'DMI金叉', indicator: 'DMI' });
            } else if (plusDI[i - 1] >= minusDI[i - 1] && plusDI[i] < minusDI[i]) {
                signals.push({ index: i, type: 'death', label: 'DMI死叉', indicator: 'DMI' });
            }
        }
    }
    
    return { plusDI, minusDI, adx, signals };
}

// ========== 评分计算 ==========

async function calculateScore(tencentCode, klineData, macd, kdj, volAvg, dmi) {
    const breakdown = [];
    let score = 50; // 基础分
    let lastIdx = klineData.length - 1;
    
    // MACD评分
    if (macd && macd.macd.length > 0) {
        const lastMacd = macd.macd[lastIdx];
        const prevMacd = macd.macd[lastIdx - 1];
        if (lastMacd > 0) {
            score += 15;
            breakdown.push({ name: 'MACD', score: 15, reason: 'MACD为正，多头趋势', positive: true });
        } else if (prevMacd > 0 && lastMacd < 0) {
            score -= 10;
            breakdown.push({ name: 'MACD', score: -10, reason: 'MACD刚死叉，空头信号', positive: false });
        } else {
            score -= 5;
            breakdown.push({ name: 'MACD', score: -5, reason: 'MACD为负，空头趋势', positive: false });
        }
    } else {
        breakdown.push({ name: 'MACD', score: 0, reason: '数据不足，无法判断', positive: true });
    }
    
    // KDJ评分
    if (kdj && kdj.k[lastIdx] !== null) {
        const lastK = kdj.k[lastIdx];
        if (lastK < 20) {
            score += 15;
            breakdown.push({ name: 'KDJ', score: 15, reason: 'KDJ超卖区(K<20)，反弹机会', positive: true });
        } else if (lastK > 80) {
            score -= 10;
            breakdown.push({ name: 'KDJ', score: -10, reason: 'KDJ超买区(K>80)，注意回调', positive: false });
        } else {
            score += 10;
            breakdown.push({ name: 'KDJ', score: 10, reason: 'KDJ在合理区间(20-80)', positive: true });
        }
    } else {
        breakdown.push({ name: 'KDJ', score: 0, reason: '数据不足，无法判断', positive: true });
    }
    
    // DMI评分
    if (dmi && dmi.plusDI[lastIdx] !== null) {
        const lastPDI = dmi.plusDI[lastIdx];
        const lastMDI = dmi.minusDI[lastIdx];
        const lastADX = dmi.adx[lastIdx];
        const prevPDI = dmi.plusDI[lastIdx - 1];
        const prevMDI = dmi.minusDI[lastIdx - 1];
        const prevADX = dmi.adx[lastIdx - 1];
        
        let dmiScore = 0;
        let dmiReasons = [];
        
        // 1. DI多空方向
        if (lastPDI > lastMDI) {
            dmiScore += 8;
            const gap = lastPDI - lastMDI;
            if (gap > 10) {
                dmiScore += 3;
                dmiReasons.push(`+DI(${lastPDI.toFixed(1)})强于-DI(${lastMDI.toFixed(1)})，差距明显`);
            } else {
                dmiReasons.push(`+DI(${lastPDI.toFixed(1)})强于-DI(${lastMDI.toFixed(1)})，多头占优`);
            }
        } else {
            dmiScore -= 8;
            const gap = lastMDI - lastPDI;
            if (gap > 10) {
                dmiScore -= 3;
                dmiReasons.push(`-DI(${lastMDI.toFixed(1)})强于+DI(${lastPDI.toFixed(1)})，差距明显`);
            } else {
                dmiReasons.push(`-DI(${lastMDI.toFixed(1)})强于+DI(${lastPDI.toFixed(1)})，空头占优`);
            }
        }
        
        // 2. 交叉信号
        if (prevPDI <= prevMDI && lastPDI > lastMDI) {
            dmiScore += 12;
            dmiReasons.push('DMI刚金叉，强买入信号');
        } else if (prevPDI >= prevMDI && lastPDI < lastMDI) {
            dmiScore -= 12;
            dmiReasons.push('DMI刚死叉，强卖出信号');
        } else if (lastPDI > lastMDI) {
            // 多头持续，衰减
            let crossAge = 0;
            for (let i = lastIdx - 1; i >= 0; i--) {
                if (dmi.plusDI[i] !== null && dmi.minusDI[i] !== null) {
                    if (dmi.plusDI[i] <= dmi.minusDI[i]) break;
                    crossAge++;
                }
            }
            if (crossAge <= 2) {
                dmiScore += 8;
                dmiReasons.push('DMI金叉不久，多头持续');
            }
        } else {
            let crossAge = 0;
            for (let i = lastIdx - 1; i >= 0; i--) {
                if (dmi.plusDI[i] !== null && dmi.minusDI[i] !== null) {
                    if (dmi.plusDI[i] >= dmi.minusDI[i]) break;
                    crossAge++;
                }
            }
            if (crossAge <= 2) {
                dmiScore -= 8;
                dmiReasons.push('DMI死叉不久，空头持续');
            }
        }
        
        // 3. ADX强度
        if (lastADX !== null) {
            if (lastADX > 40) {
                dmiScore += 8;
                dmiReasons.push(`ADX(${lastADX.toFixed(1)})极强，趋势明确`);
            } else if (lastADX >= 25) {
                dmiScore += 5;
                dmiReasons.push(`ADX(${lastADX.toFixed(1)})较强，趋势确立`);
            } else if (lastADX < 20) {
                dmiScore -= 5;
                dmiReasons.push(`ADX(${lastADX.toFixed(1)})过低，震荡行情`);
            }
            
            // 4. ADX趋势
            if (prevADX !== null) {
                if (prevADX < 20 && lastADX >= 25) {
                    dmiScore += 5;
                    dmiReasons.push('ADX从低位拐头向上，趋势启动');
                } else if (prevADX > 40 && lastADX < prevADX) {
                    dmiScore -= 3;
                    dmiReasons.push('ADX高位回落，趋势衰减');
                }
                
                // 5. 共振
                if (lastADX > prevADX && lastPDI > lastMDI) {
                    dmiScore += 5;
                    dmiReasons.push('ADX上升+多头共振，强上升趋势');
                } else if (lastADX > prevADX && lastPDI < lastMDI) {
                    dmiScore -= 5;
                    dmiReasons.push('ADX上升+空头共振，强下降趋势');
                }
            }
        }
        
        score += dmiScore;
        breakdown.push({
            name: 'DMI',
            score: dmiScore,
            reason: dmiReasons.length > 0 ? dmiReasons.join('；') : 'DMI信号中性',
            positive: dmiScore >= 0
        });
    } else {
        breakdown.push({ name: 'DMI', score: 0, reason: '数据不足，无法判断', positive: true });
    }
    
    // 成交量评分
    if (volAvg && volAvg.length > 0) {
        const todayVol = klineData[lastIdx].volume;
        const avgVol = volAvg[lastIdx];
        const ratio = todayVol / avgVol;
        if (ratio > 1.5) {
            score += 10;
            breakdown.push({ name: '成交量', score: 10, reason: `放量(${ratio.toFixed(2)}倍均量)，资金活跃`, positive: true });
        } else if (ratio < 0.5) {
            score -= 5;
            breakdown.push({ name: '成交量', score: -5, reason: `缩量(${ratio.toFixed(2)}倍均量)，交投冷清`, positive: false });
        } else {
            breakdown.push({ name: '成交量', score: 0, reason: `成交正常(${ratio.toFixed(2)}倍均量)`, positive: true });
        }
    } else {
        breakdown.push({ name: '成交量', score: 0, reason: '数据不足', positive: true });
    }
    
    // 实时数据加分（换手率、涨跌幅）
    try {
        const url = `https://qt.gtimg.cn/q=${tencentCode}`;
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
        });
        const text = iconv.decode(response.data, 'gbk');
        const match = text.match(/v_[^=]+="([^"]+)"/);
        if (match) {
            const parts = match[1].split('~');
            if (parts.length >= 45) {
                const turnover = parseFloat(parts[38]) || 0;
                const price = parseFloat(parts[3]) || 0;
                const prevClose = parseFloat(parts[4]) || 0;
                const change = prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0;
                
                // 换手率
                if (turnover >= 2 && turnover <= 10) {
                    score += 10;
                    breakdown.push({ name: '换手率', score: 10, reason: `换手率${turnover.toFixed(2)}%，交易活跃`, positive: true });
                } else if (turnover > 15) {
                    score -= 5;
                    breakdown.push({ name: '换手率', score: -5, reason: `换手率${turnover.toFixed(2)}%过高，警惕出货`, positive: false });
                } else if (turnover < 1) {
                    score -= 5;
                    breakdown.push({ name: '换手率', score: -5, reason: `换手率${turnover.toFixed(2)}%过低，缺乏关注`, positive: false });
                } else {
                    breakdown.push({ name: '换手率', score: 0, reason: `换手率${turnover.toFixed(2)}%正常`, positive: true });
                }
                
                // 涨跌幅
                if (change > 0) {
                    score += 5;
                    breakdown.push({ name: '涨跌幅', score: 5, reason: `上涨${change.toFixed(2)}%，多头占优`, positive: true });
                } else if (change < -3) {
                    score -= 5;
                    breakdown.push({ name: '涨跌幅', score: -5, reason: `下跌${change.toFixed(2)}%，空头较强`, positive: false });
                } else {
                    breakdown.push({ name: '涨跌幅', score: 0, reason: `微跌${change.toFixed(2)}%，观望`, positive: true });
                }
            }
        }
    } catch (e) {
        breakdown.push({ name: '实时数据', score: 0, reason: '获取失败', positive: true });
    }
    
    score = Math.min(100, Math.max(0, score));
    
    // 总结
    let summary = '';
    const positiveItems = breakdown.filter(b => b.score > 0);
    const negativeItems = breakdown.filter(b => b.score < 0);
    if (positiveItems.length >= 3 && negativeItems.length <= 1) {
        summary = '多头信号强，积极关注';
    } else if (negativeItems.length >= 3) {
        summary = '空头信号多，谨慎对待';
    } else if (positiveItems.length > negativeItems.length) {
        summary = '偏多，可适当关注';
    } else {
        summary = '偏空，保持观望';
    }
    
    return { total: score, breakdown, summary };
}

// ========== 新闻获取 ==========

async function getWallstreetNews(stockName) {
    try {
        const url = `https://api-prod.wallstreetcn.com/apiv1/search/article?query=${encodeURIComponent(stockName)}&cursor=&limit=15`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        
        const data = response.data;
        if (data?.code !== 20000 || !data?.data?.items) return [];
        
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        return data.data.items
            .map(item => ({
                title: item.title.replace(/<\/?em>/g, ''),
                date: item.display_time ? new Date(item.display_time * 1000).toISOString() : '',
                source: item.source_name || '华尔街见闻',
                url: `https://wallstreetcn.com/articles/${item.uri}`
            }))
            .filter(item => {
                if (!item.date) return true;
                const d = new Date(item.date);
                return d >= thirtyDaysAgo;
            })
            .slice(0, 10);
    } catch (err) {
        console.error('Wallstreet News API Error:', err.message);
        return [];
    }
}

async function getEastmoneyAnnouncements(stockCode) {
    try {
        const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=15&page_index=1&ann_type=A&stock_list=${stockCode}`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        
        const list = response.data?.data?.list || [];
        if (!list.length) return [];
        
        return list.map(item => ({
            title: item.title,
            date: item.notice_date ? item.notice_date.split(' ')[0] : '',
            source: item.columns?.[0]?.column_name || '东方财富',
            url: `https://data.eastmoney.com/notices/detail/${stockCode}/${item.art_code}.html`
        }));
    } catch (err) {
        console.error('Eastmoney Announcements API Error:', err.message);
        return [];
    }
}

async function getStockNews(stockName, stockCode) {
    const [wscn, emAnnouncements] = await Promise.all([
        getWallstreetNews(stockName),
        getEastmoneyAnnouncements(stockCode)
    ]);
    
    // 合并去重，按日期排序
    const all = [...wscn, ...emAnnouncements];
    all.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date) - new Date(a.date);
    });
    
    // 去重：按标题去重
    const seen = new Set();
    return all.filter(item => {
        const key = item.title.slice(0, 20);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 20);
}

// ========== API ==========

app.get('/api/stock', async (req, res) => {
    const rawCode = req.query.code;
    if (!rawCode) return res.status(400).json({ error: '缺少股票代码或名称' });

    try {
        let stockCode = rawCode;
        let stockName = null;
        
        if (containsChinese(rawCode)) {
            const resolvedName = resolveStockAlias(rawCode);
            const searchResult = await searchStockCodeByName(resolvedName);
            if (!searchResult) return res.status(404).json({ error: '未找到该股票，请尝试输入股票代码（如 002230）或正式名称' });
            stockCode = searchResult.code + '.' + searchResult.market;
            stockName = searchResult.name;
        }
        
        const code = convertToTencentCode(stockCode);
        const url = `https://qt.gtimg.cn/q=${code}`;
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
        });

        const text = iconv.decode(response.data, 'gbk');
        const match = text.match(/v_[^=]+="([^"]+)"/);
        if (!match) return res.status(500).json({ error: '数据解析失败' });

        const parts = match[1].split('~');
        if (parts.length < 45) return res.status(500).json({ error: '数据不完整' });

        const data = {
            name: stockName || parts[1],
            price: parseFloat(parts[3]),
            change: ((parseFloat(parts[3]) - parseFloat(parts[4])) / parseFloat(parts[4]) * 100),
            volume: parseFloat(parts[6]),
            turnover: parseFloat(parts[38]),
            high: parseFloat(parts[33]),
            low: parseFloat(parts[34]),
            open: parseFloat(parts[5]),
            prevClose: parseFloat(parts[4]),
            pe: parseFloat(parts[52]) || 0,
            pb: parseFloat(parts[46]) || 0,
            marketCap: parseFloat(parts[45]) || 0,
            roe: (parseFloat(parts[46]) || 0) / (parseFloat(parts[52]) || 1) * 100,
            outVolume: parseFloat(parts[7]) || 0,
            inVolume: parseFloat(parts[8]) || 0,
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
            const indexKey = { day: 'day', week: 'week', month: 'month' };
            
            const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},${periodMap[period]},${startStr},${endStr},500,qfq`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000
            });
            
            // 股票用 qfqday（前复权），指数用 day（指数无需复权）
            let rawData = response.data.data[tencentCode][periodKey[period]] || [];
            if (rawData.length === 0) {
                rawData = response.data.data[tencentCode][indexKey[period]] || [];
            }
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
                            responseType: 'arraybuffer',
                            headers: { 'User-Agent': 'Mozilla/5.0' },
                            timeout: 5000
                        });
                        const rtText = iconv.decode(rtResponse.data, 'gbk');
                        const match = rtText.match(/v_[^=]+="([^"]+)"/);
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
            const boll = calculateBOLL(closes);
            const dmi = calculateDMI(highs, lows, closes);
            
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
            if (boll && boll.signals) {
                boll.signals.forEach(s => allSignals.push(s));
            }
            if (dmi && dmi.signals) {
                dmi.signals.forEach(s => allSignals.push({ ...s, indicator: 'DMI' }));
            }
            
            // 计算评分
            const score = await calculateScore(tencentCode, klineData, macd, kdj, volAnalysis.avg20, dmi);
            
            const lastIdx = klineData.length - 1;
            let bollPressure = null;
            if (boll && boll.up && boll.up.length > 0) {
                // 找到最后一个有效的BOLL值
                let validIdx = lastIdx;
                while (validIdx >= 0 && boll.up[validIdx] === null) validIdx--;
                if (validIdx >= 0) {
                    bollPressure = {
                        pressure: boll.up[validIdx],
                        support: boll.dn[validIdx],
                        mid: boll.mb[validIdx]
                    };
                }
            }
            
            res.json({
                period,
                data: klineData,
                macd: macd ? { dif: macd.dif, dea: macd.dea, macd: macd.macd } : null,
                kdj: kdj ? { k: kdj.k, d: kdj.d, j: kdj.j } : null,
                boll: boll ? { mb: boll.mb, up: boll.up, dn: boll.dn } : null,
                bollPressure,
                dmi: dmi ? { plusDI: dmi.plusDI, minusDI: dmi.minusDI, adx: dmi.adx } : null,
                volumeAvg: volAnalysis ? volAnalysis.avg20 : null,
                signals: allSignals,
                score
            });
        }
    } catch (err) {
        console.error('Kline API Error:', err.message);
        res.status(500).json({ error: '获取K线数据失败: ' + err.message });
    }
});

app.get('/api/news', async (req, res) => {
    const { code, name } = req.query;
    if (!code) return res.status(400).json({ error: '缺少股票代码' });
    
    try {
        let stockName = name;
        let pureCode = getPureCode(convertToTencentCode(code));
        
        // 如果没有传入名称，或者名称是乱码（不含中文），尝试获取正确名称
        if (!stockName || !containsChinese(stockName)) {
            console.log('Searching for code:', pureCode);
            const searchResult = await searchStockCodeByName(pureCode);
            console.log('Search result:', searchResult);
            if (searchResult) {
                stockName = searchResult.name;
            }
        }
        
        console.log('Final stockName:', stockName, 'code:', pureCode);
        const news = await getStockNews(stockName || code, pureCode);
        res.json({ news });
    } catch (err) {
        console.error('News API Error:', err.message);
        res.status(500).json({ error: '获取新闻失败: ' + err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Stock Analyzer Server running on port ${PORT}`);
});