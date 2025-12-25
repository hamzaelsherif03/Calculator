import { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, DollarSign, Target, Activity, Info, X, Moon, Sun } from 'lucide-react';

// Cookie utility functions
const setCookie = (name: string, value: string, days: number = 365) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
};

const getCookie = (name: string): string | null => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

export default function App() {
  // Load values from cookies or use defaults
  const [gridStartPrice, setGridStartPrice] = useState(() => {
    const saved = getCookie('gridStartPrice');
    return saved ? parseFloat(saved) : 2650;
  });
  const [currentPrice, setCurrentPrice] = useState(() => {
    const saved = getCookie('currentPrice');
    return saved ? parseFloat(saved) : 2600;
  });
  const [step, setStep] = useState(() => {
    const saved = getCookie('step');
    return saved ? parseFloat(saved) : 5;
  });
  const [lotSize, setLotSize] = useState(() => {
    const saved = getCookie('lotSize');
    return saved ? parseFloat(saved) : 0.1;
  });
  const [levels, setLevels] = useState(() => {
    const saved = getCookie('levels');
    return saved ? parseInt(saved) : 20;
  });
  const [tp, setTp] = useState(() => {
    const saved = getCookie('tp');
    return saved ? parseFloat(saved) : 5;
  });
  const [balanceUSC, setBalanceUSC] = useState(() => {
    const saved = getCookie('balanceUSC');
    return saved ? parseFloat(saved) : 10000;
  });
  const [leverage, setLeverage] = useState(() => {
    const saved = getCookie('leverage');
    return saved ? parseFloat(saved) : 2000;
  });
  const [contractSize] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showEquityCurveInfo, setShowEquityCurveInfo] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = getCookie('darkMode');
    return saved === 'true';
  });

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setCookie('darkMode', darkMode.toString());
  }, [darkMode]);

  // Save to cookies whenever values change
  useEffect(() => {
    setCookie('gridStartPrice', gridStartPrice.toString());
  }, [gridStartPrice]);

  useEffect(() => {
    setCookie('currentPrice', currentPrice.toString());
  }, [currentPrice]);

  useEffect(() => {
    setCookie('step', step.toString());
  }, [step]);

  useEffect(() => {
    setCookie('lotSize', lotSize.toString());
  }, [lotSize]);

  useEffect(() => {
    setCookie('levels', levels.toString());
  }, [levels]);

  useEffect(() => {
    setCookie('tp', tp.toString());
  }, [tp]);

  useEffect(() => {
    setCookie('balanceUSC', balanceUSC.toString());
  }, [balanceUSC]);

  useEffect(() => {
    setCookie('leverage', leverage.toString());
  }, [leverage]);

  const precision = 2;

  const table = useMemo(() => {
    const arr: any[] = [];
    for (let i = 0; i < levels; i++) {
      const levelPrice = +(gridStartPrice - i * step).toFixed(precision);
      const lotsAtThisLevel = +lotSize.toFixed(4);
      const cumulativeLots = +(lotsAtThisLevel * (i + 1)).toFixed(4);
      const totalOunces = +(cumulativeLots * contractSize).toFixed(2);
      const notionalUSD = +(levelPrice * totalOunces).toFixed(2);
      const notionalUSC = +(notionalUSD * 100).toFixed(2);
      const margin = +((notionalUSD / leverage) * 100).toFixed(2);
      const profitPerLotUSC = +((tp * contractSize) * 100).toFixed(2);
      const potentialProfitIfAllClosed = +((lotsAtThisLevel * (i + 1)) * profitPerLotUSC).toFixed(2);

      // Is this level triggered?
      const isTriggered = currentPrice <= levelPrice;

      arr.push({
        idx: i + 1,
        levelPrice,
        lotsAtThisLevel,
        cumulativeLots,
        totalOunces,
        notionalUSD,
        notionalUSC,
        margin,
        potentialProfitIfAllClosed,
        isTriggered
      });
    }
    return arr;
  }, [gridStartPrice, step, lotSize, levels, tp, leverage, contractSize, currentPrice]);

  const analysis = useMemo(() => {
    if (!table.length) return null;

    // Find how many levels are actually triggered
    const triggeredLevels = table.filter(r => r.isTriggered);
    const numTriggered = triggeredLevels.length;

    if (numTriggered === 0) {
      return {
        numTriggered: 0,
        noPositions: true
      };
    }

    const lastTriggered = triggeredLevels[triggeredLevels.length - 1];

    const totalLots = lastTriggered.cumulativeLots;
    const totalOunces = lastTriggered.totalOunces;

    // Recalculate margin/exposure based on CURRENT price (broker dependent, but usually current)
    const currentNotionalUSD = +(currentPrice * totalOunces).toFixed(2);
    const notionalUSC = +(currentNotionalUSD * 100).toFixed(2);
    const usedMargin = +((currentNotionalUSD / leverage) * 100).toFixed(2);

    const marginPercent = +((usedMargin / (balanceUSC || 1)) * 100).toFixed(2);

    const profitPerLotUSC = +((tp * contractSize) * 100).toFixed(2);
    const totalPotentialProfit = +(totalLots * profitPerLotUSC).toFixed(2);

    // Calculate average entry price of TRIGGERED positions only
    const avgEntry = triggeredLevels.reduce((s, r) => s + r.levelPrice * r.lotsAtThisLevel, 0) / totalLots;
    const avgEntryFixed = +avgEntry.toFixed(2);

    // Current floating P/L - Use raw avgEntry for precision
    const currentFloatingPL = +((currentPrice - avgEntry) * totalOunces * 100).toFixed(2);

    // Break even price is just the average entry (where P/L = 0)
    const breakEvenPrice = avgEntryFixed;
    // Profit target is where we want to exit
    const profitTargetPrice = +(avgEntryFixed + tp).toFixed(2);

    // Additional drawdown scenarios from CURRENT price
    // Simulate what happens if price drops further (triggering more levels)
    const simulateDrop = (dropAmount: number) => {
      const newPrice = currentPrice - dropAmount;
      // Find all levels that would be triggered at newPrice
      const newTriggered = table.filter(r => newPrice <= r.levelPrice);

      if (newTriggered.length === 0) return 0;

      const lastNew = newTriggered[newTriggered.length - 1];
      const newTotalOunces = lastNew.totalOunces;
      const newTotalLots = lastNew.cumulativeLots;

      // Calculate new average entry for all triggered positions
      const newAvgEntry = newTriggered.reduce((s, r) => s + r.levelPrice * r.lotsAtThisLevel, 0) / newTotalLots;

      // Calculate floating P/L at the new price
      return +((newPrice - newAvgEntry) * newTotalOunces * 100).toFixed(2);
    };

    const drop10 = simulateDrop(10);
    const drop25 = simulateDrop(25);
    const drop50 = simulateDrop(50);
    const drop100 = simulateDrop(100);

    // Margin call estimation - Iterative approach (Binary Search)
    const stopOutLevel = 0.50;

    const findPriceForEquity = (targetEquity: number) => {
      let low = 0;
      let high = currentPrice;
      let targetPrice = 0;

      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        const triggeredAtMid = table.filter(r => mid <= r.levelPrice);

        if (triggeredAtMid.length === 0) {
          high = mid;
          continue;
        }

        const lastAtMid = triggeredAtMid[triggeredAtMid.length - 1];
        const totalLotsAtMid = lastAtMid.cumulativeLots;
        const totalOuncesAtMid = lastAtMid.totalOunces;
        const avgEntryAtMid = triggeredAtMid.reduce((s, r) => s + r.levelPrice * r.lotsAtThisLevel, 0) / totalLotsAtMid;

        const floatingPLAtMid = (mid - avgEntryAtMid) * totalOuncesAtMid * 100;
        const equityAtMid = balanceUSC + floatingPLAtMid;

        if (equityAtMid <= targetEquity) {
          targetPrice = mid;
          low = mid;
        } else {
          high = mid;
        }
      }
      return +targetPrice.toFixed(2);
    };

    const marginCallPrice = (() => {
      let low = 0;
      let high = currentPrice;
      let resultPrice = 0;

      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        const triggeredAtMid = table.filter(r => mid <= r.levelPrice);

        if (triggeredAtMid.length === 0) {
          high = mid;
          continue;
        }

        const lastAtMid = triggeredAtMid[triggeredAtMid.length - 1];
        const totalLotsAtMid = lastAtMid.cumulativeLots;
        const totalOuncesAtMid = lastAtMid.totalOunces;
        const avgEntryAtMid = triggeredAtMid.reduce((s, r) => s + r.levelPrice * r.lotsAtThisLevel, 0) / totalLotsAtMid;

        const floatingPLAtMid = (mid - avgEntryAtMid) * totalOuncesAtMid * 100;
        const equityAtMid = balanceUSC + floatingPLAtMid;

        const notionalUSDAtMid = mid * totalOuncesAtMid;
        const usedMarginAtMid = (notionalUSDAtMid / leverage) * 100;

        if (equityAtMid <= usedMarginAtMid * stopOutLevel) {
          resultPrice = mid;
          low = mid;
        } else {
          high = mid;
        }
      }
      return +resultPrice.toFixed(2);
    })();

    const dd25Price = findPriceForEquity(balanceUSC * 0.75);
    const dd50Price = findPriceForEquity(balanceUSC * 0.50);
    const dd75Price = findPriceForEquity(balanceUSC * 0.25);

    const dd25Amount = +(balanceUSC * 0.25).toFixed(2);
    const dd50Amount = +(balanceUSC * 0.50).toFixed(2);
    const dd75Amount = +(balanceUSC * 0.75).toFixed(2);
    const maxSafeDrop = +(currentPrice - marginCallPrice).toFixed(2);
    const currentEquity = +(balanceUSC + currentFloatingPL).toFixed(2);

    // Risk level assessment
    let riskLevel = 'LOW';
    let riskColor = 'green';
    if (marginPercent > 70) {
      riskLevel = 'EXTREME';
      riskColor = 'red';
    } else if (marginPercent > 50) {
      riskLevel = 'HIGH';
      riskColor = 'orange';
    } else if (marginPercent > 30) {
      riskLevel = 'MODERATE';
      riskColor = 'yellow';
    }

    return {
      numTriggered,
      totalLots,
      totalOunces,
      usedMargin,
      notionalUSC,
      marginPercent,
      totalPotentialProfit,
      avgEntryFixed,
      currentFloatingPL,
      breakEvenPrice,
      profitTargetPrice,
      drop10,
      drop25,
      drop50,
      drop100,
      marginCallPrice,
      dd25Price,
      dd50Price,
      dd75Price,
      dd25Amount,
      dd50Amount,
      dd75Amount,
      maxSafeDrop,
      riskLevel,
      riskColor,
      lowestTriggered: lastTriggered.levelPrice,
      currentEquity,
      noPositions: false,
      equityCurveData: (() => {
        // Generate data points for the equity curve
        const points = [];
        const startP = currentPrice;
        const endP = Math.max(0, marginCallPrice - 50); // Go a bit below margin call
        const steps = 50;
        const stepSize = (startP - endP) / steps;

        for (let i = 0; i <= steps; i++) {
          const p = startP - i * stepSize;
          // Calculate equity at price p
          // 1. Find triggered levels at price p
          const triggeredAtP = table.filter(r => p <= r.levelPrice);
          let equityAtP = balanceUSC;

          if (triggeredAtP.length > 0) {
            const lastAtP = triggeredAtP[triggeredAtP.length - 1];
            const totalLotsAtP = lastAtP.cumulativeLots;
            const totalOuncesAtP = lastAtP.totalOunces;
            const avgEntryAtP = triggeredAtP.reduce((s, r) => s + r.levelPrice * r.lotsAtThisLevel, 0) / totalLotsAtP;
            const floatingPLAtP = (p - avgEntryAtP) * totalOuncesAtP * 100;
            equityAtP = balanceUSC + floatingPLAtP;
          }

          points.push({ price: p, equity: equityAtP });
        }
        return points;
      })()
    };
  }, [table, balanceUSC, tp, contractSize, currentPrice, levels, leverage]);

  function downloadCSV() {
    const rows = [
      ['Level #', 'Level Price', 'Status', 'Lots at Level', 'Cumulative Lots', 'Total Ounces', 'Potential Profit (USC)'],
      ...table.map(r => [r.idx, r.levelPrice, r.isTriggered ? 'TRIGGERED' : 'Waiting', r.lotsAtThisLevel, r.cumulativeLots, r.totalOunces, r.potentialProfitIfAllClosed])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xau-grid-analysis.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const getRiskColorClass = (color: string) => {
    const colors: Record<string, string> = {
      green: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100',
      yellow: 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700 text-yellow-900 dark:text-yellow-100',
      orange: 'bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-100',
      red: 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100'
    };
    return colors[color] || colors.green;
  };

  const EquityChart = ({ data, marginCallEquity, balance }: { data: { price: number, equity: number }[], marginCallEquity: number, balance: number }) => {
    if (!data || data.length === 0) return null;

    const width = 100;
    const height = 50;
    const padding = 5;

    const maxEquity = Math.max(...data.map(d => d.equity), balance);
    const minEquity = Math.min(...data.map(d => d.equity), 0); // Allow going below 0 for visual
    const equityRange = maxEquity - minEquity || 1;

    const maxPrice = data[0].price;
    const minPrice = data[data.length - 1].price;
    const priceRange = maxPrice - minPrice || 1;

    const getX = (price: number) => padding + ((maxPrice - price) / priceRange) * (width - 2 * padding);
    const getY = (equity: number) => height - padding - ((equity - minEquity) / equityRange) * (height - 2 * padding);

    const points = data.map(d => `${getX(d.price)},${getY(d.equity)}`).join(' ');
    const zeroLineY = getY(0);
    const balanceLineY = getY(balance);
    const marginCallLineY = getY(marginCallEquity); // Approximate visual line

    return (
      <div className="w-full h-48 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-2 relative overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1={padding} y1={zeroLineY} x2={width - padding} y2={zeroLineY} stroke="#e2e8f0" strokeWidth="0.5" />

          {/* Balance Line */}
          <line x1={padding} y1={balanceLineY} x2={width - padding} y2={balanceLineY} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2" />

          {/* Margin Call Line (Death Line) */}
          <line x1={padding} y1={marginCallLineY} x2={width - padding} y2={marginCallLineY} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="1" />

          {/* Equity Curve */}
          <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="1.5" />

          {/* Area under curve */}
          <polygon points={`${points} ${getX(minPrice)},${getY(minEquity)} ${getX(maxPrice)},${getY(minEquity)}`} fill="url(#gradient)" opacity="0.2" />

          <defs>
            <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute top-2 left-2 text-xs font-bold text-slate-500 dark:text-slate-400">Equity Curve</div>
        <div className="absolute bottom-2 right-2 text-xs text-slate-400 dark:text-slate-500">Price Drop →</div>
      </div>
    );
  };

  const GridLadder = ({ table }: { table: any[] }) => {
    const maxLots = Math.max(...table.map(r => r.lotsAtThisLevel));

    return (
      <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
        {table.map((row) => (
          <div key={row.idx} className="flex items-center gap-2 text-xs">
            <div className="w-12 text-right font-mono text-slate-500 dark:text-slate-400">${row.levelPrice}</div>
            <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-sm overflow-hidden relative">
              <div
                className={`h-full transition-all ${row.isTriggered ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-500'}`}
                style={{ width: `${(row.lotsAtThisLevel / maxLots) * 100}%` }}
              />
            </div>
            <div className="w-8 text-right text-slate-600 dark:text-slate-400">{row.lotsAtThisLevel}</div>
          </div>
        ))}
      </div>
    );
  };

  const CalculationModal = ({ onClose }: { onClose: () => void }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-transparent dark:border-slate-700">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">How Calculations Work</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition">
            <X className="w-6 h-6 text-slate-500 dark:text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-4 text-slate-700 dark:text-slate-300">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">Average Entry Price</h4>
            <p className="text-sm">Weighted average of all open positions. <br /><code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">Sum(Price * Lots) / Total Lots</code></p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">Floating P/L</h4>
            <p className="text-sm">Profit or loss based on the difference between Current Price and Average Entry. <br /><code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">(Current Price - Avg Entry) * Total Ounces * 100</code></p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">Margin Call Estimation</h4>
            <p className="text-sm">We use an iterative simulation (binary search) to find the exact price where your Equity drops to 50% of Used Margin. This accounts for new positions opening as price drops.</p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">Equity Curve</h4>
            <p className="text-sm">The blue line shows your projected Equity as price drops. The steepening curve illustrates how risk accelerates in a grid strategy.</p>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl">
          <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
            Got it
          </button>
        </div>
      </div>
    </div>
  );

  const priceDropped = currentPrice < gridStartPrice;
  const priceChange = Math.abs(currentPrice - gridStartPrice);
  const priceChangePercent = +((priceChange / gridStartPrice) * 100).toFixed(2);

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 mb-6 flex justify-between items-start border border-transparent dark:border-slate-700">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-slate-800 dark:text-white">XAU/USD Grid Risk Calculator</h1>
            <p className="text-slate-600 dark:text-slate-400">Enter your grid start price and current price to see real-time position status and risk analysis.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-slate-600" />}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
            >
              <Info className="w-5 h-5" />
              How it works
            </button>
          </div>
        </div>

        {/* Hero Section - Price & Position Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* Left Hero - Price Status (Blue) */}
          <div className="lg:col-span-2 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 rounded-2xl shadow-2xl p-8 text-white relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <DollarSign className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold">Price Status</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                  <div className="text-sm font-medium opacity-80 mb-2">Grid Started At</div>
                  <div className="text-4xl font-bold tracking-tight">${gridStartPrice.toLocaleString()}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                  <div className="text-sm font-medium opacity-80 mb-2">Current Price</div>
                  <div className="text-4xl font-bold tracking-tight">${currentPrice.toLocaleString()}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                  <div className="text-sm font-medium opacity-80 mb-2">Price Movement</div>
                  <div className={`text-4xl font-bold tracking-tight ${priceDropped ? 'text-red-300' : 'text-green-300'}`}>
                    {priceDropped ? '-' : '+'}${priceChange.toLocaleString()}
                  </div>
                  <div className="text-sm font-medium opacity-80 mt-1 flex items-center gap-1">
                    <span className={`text-lg ${priceDropped ? 'text-red-300' : 'text-green-300'}`}>
                      {priceDropped ? '↓' : '↑'}
                    </span>
                    {priceChangePercent}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Strategy Parameters (Compact) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl dark:shadow-slate-900/50 p-5 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <span className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <Target className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </span>
              Strategy Parameters
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Start Price</div>
                  <input type="number" value={gridStartPrice} onChange={e => setGridStartPrice(parseFloat(e.target.value) || 0)} className="w-full p-2 text-sm border-2 border-blue-200 dark:border-blue-800 rounded-lg focus:border-blue-500 focus:outline-none font-semibold bg-blue-50/50 dark:bg-blue-900/30 dark:text-white" />
                </label>
                <label className="space-y-1">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Current Price</div>
                  <input type="number" value={currentPrice} onChange={e => setCurrentPrice(parseFloat(e.target.value) || 0)} className="w-full p-2 text-sm border-2 border-blue-200 dark:border-blue-800 rounded-lg focus:border-blue-500 focus:outline-none font-semibold bg-blue-50/50 dark:bg-blue-900/30 dark:text-white" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Grid Step</div>
                  <input type="number" value={step} onChange={e => setStep(parseFloat(e.target.value) || 0)} className="w-full p-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:border-blue-500 focus:outline-none dark:bg-slate-700 dark:text-white" />
                </label>
                <label className="space-y-1">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Lot Size</div>
                  <input type="number" step="0.01" value={lotSize} onChange={e => setLotSize(parseFloat(e.target.value) || 0)} className="w-full p-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:border-blue-500 focus:outline-none dark:bg-slate-700 dark:text-white" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Levels</div>
                  <input type="number" value={levels} onChange={e => setLevels(parseInt(e.target.value) || 0)} className="w-full p-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:border-blue-500 focus:outline-none dark:bg-slate-700 dark:text-white" />
                </label>
                <label className="space-y-1">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Take Profit</div>
                  <input type="number" value={tp} onChange={e => setTp(parseFloat(e.target.value) || 0)} className="w-full p-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:border-blue-500 focus:outline-none dark:bg-slate-700 dark:text-white" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Balance (USC)</div>
                  <input type="number" value={balanceUSC} onChange={e => setBalanceUSC(parseFloat(e.target.value) || 0)} className="w-full p-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:border-blue-500 focus:outline-none dark:bg-slate-700 dark:text-white" />
                </label>
                <label className="space-y-1">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Leverage</div>
                  <input type="number" value={leverage} onChange={e => setLeverage(parseFloat(e.target.value) || 1)} className="w-full p-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:border-blue-500 focus:outline-none dark:bg-slate-700 dark:text-white" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Position Status Hero (Purple) */}
        {analysis && !analysis.noPositions && (
          <div className="bg-gradient-to-br from-purple-500 via-purple-600 to-fuchsia-700 rounded-2xl shadow-2xl p-8 mb-6 text-white relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 left-1/4 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-56 h-56 bg-white/5 rounded-full translate-y-1/2 translate-x-1/4"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Activity className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold">Active Positions Status</h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                  <div className="text-sm font-medium opacity-80 mb-2">Triggered Levels</div>
                  <div className="text-4xl font-bold tracking-tight">{analysis.numTriggered} <span className="text-2xl opacity-70">/ {levels}</span></div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                  <div className="text-sm font-medium opacity-80 mb-2">Current Equity</div>
                  <div className="text-4xl font-bold tracking-tight">{analysis.currentEquity?.toLocaleString() ?? '0'}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                  <div className="text-sm font-medium opacity-80 mb-2">Floating P/L</div>
                  <div className={`text-4xl font-bold tracking-tight ${(analysis.currentFloatingPL ?? 0) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {(analysis.currentFloatingPL ?? 0) >= 0 ? '+' : ''}{(analysis.currentFloatingPL ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                  <div className="text-sm font-medium opacity-80 mb-2">Avg Entry Price</div>
                  <div className="text-4xl font-bold tracking-tight">${analysis.avgEntryFixed?.toLocaleString() ?? '0'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {analysis && analysis.noPositions && (
          <div className="bg-gradient-to-br from-purple-500 via-purple-600 to-fuchsia-700 rounded-2xl shadow-2xl p-8 mb-6 text-white relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 left-1/4 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-56 h-56 bg-white/5 rounded-full translate-y-1/2 translate-x-1/4"></div>

            <div className="relative z-10 flex items-center gap-4">
              <div className="p-4 bg-white/20 rounded-xl backdrop-blur-sm">
                <Activity className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-1">No Positions Active Yet</h3>
                <p className="opacity-90">Current price (${currentPrice}) is still above your first grid level (${gridStartPrice.toFixed(2)}). Positions will trigger when price drops to this level.</p>
              </div>
            </div>
          </div>
        )}

        {/* Critical Analysis Dashboard */}
        {analysis && !analysis.noPositions && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* Price Levels Card */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/30 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 border-2 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-8 h-8 text-blue-700 dark:text-blue-400" />
                <h3 className="text-xl font-bold text-blue-900 dark:text-blue-100">Critical Price Levels</h3>
              </div>

              <div className="space-y-3">
                <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg">
                  <div className="text-sm text-green-800 dark:text-green-400 font-medium">Break Even Price</div>
                  <div className="text-2xl font-bold text-green-900 dark:text-green-300">${analysis.breakEvenPrice?.toLocaleString() ?? '0'}</div>
                  <div className="text-xs text-green-700 dark:text-green-500 mt-1">Avg Entry Level</div>
                </div>
                <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg">
                  <div className="text-sm text-emerald-800 dark:text-emerald-400 font-medium">Profit Target (TP)</div>
                  <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-300">${analysis.profitTargetPrice?.toLocaleString() ?? '0'}</div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-500 mt-1">Avg Entry + TP</div>
                </div>
                <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg">
                  <div className="text-sm text-red-800 dark:text-red-400 font-medium">Estimated Margin Call</div>
                  <div className="text-2xl font-bold text-red-900 dark:text-red-300">${analysis.marginCallPrice?.toLocaleString() ?? '0'}</div>
                  <div className="text-xs text-red-700 dark:text-red-500 mt-1">~${analysis.maxSafeDrop} drop from current</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg border border-orange-200 dark:border-orange-800/50">
                    <div className="text-[10px] text-orange-800 dark:text-orange-400 font-bold uppercase tracking-wider mb-1">25% DD</div>
                    <div className="text-lg font-bold text-orange-900 dark:text-orange-300">
                      ${analysis.dd25Price > 0 ? analysis.dd25Price.toLocaleString() : '---'}
                    </div>
                    <div className="text-[10px] text-orange-700 dark:text-orange-500 font-medium mt-1">-{analysis.dd25Amount.toLocaleString()} USC</div>
                  </div>
                  <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg border border-red-200 dark:border-red-800/50">
                    <div className="text-[10px] text-red-800 dark:text-red-400 font-bold uppercase tracking-wider mb-1">50% DD</div>
                    <div className="text-lg font-bold text-red-900 dark:text-red-300">
                      ${analysis.dd50Price > 0 ? analysis.dd50Price.toLocaleString() : '---'}
                    </div>
                    <div className="text-[10px] text-red-700 dark:text-red-500 font-medium mt-1">-{analysis.dd50Amount.toLocaleString()} USC</div>
                  </div>
                  <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg border border-purple-200 dark:border-purple-800/50">
                    <div className="text-[10px] text-purple-800 dark:text-purple-400 font-bold uppercase tracking-wider mb-1">75% DD</div>
                    <div className="text-lg font-bold text-purple-900 dark:text-purple-300">
                      ${analysis.dd75Price > 0 ? analysis.dd75Price.toLocaleString() : '---'}
                    </div>
                    <div className="text-[10px] text-purple-700 dark:text-purple-500 font-medium mt-1">-{analysis.dd75Amount.toLocaleString()} USC</div>
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg">
                  <div className="text-sm text-slate-800 dark:text-slate-300 font-medium">Lowest Triggered Level</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">${analysis.lowestTriggered.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Drawdown Scenarios Card */}
            {/* Drawdown Scenarios Card */}
            <div className="bg-gradient-to-br from-rose-50 to-orange-50 dark:from-red-900/40 dark:to-orange-900/20 rounded-2xl shadow-xl dark:shadow-slate-900/50 p-6 border-2 border-rose-100/80 dark:border-rose-800/50 relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-3xl rounded-full pointer-events-none -mr-10 -mt-10"></div>

              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="p-3 bg-gradient-to-br from-rose-100 to-orange-100 dark:from-rose-900/60 dark:to-orange-900/60 rounded-xl text-rose-600 dark:text-rose-400 shadow-sm border border-rose-200/50 dark:border-rose-700/50">
                  <TrendingDown className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">If Price Drops Further</h3>
              </div>

              <div className="space-y-3 relative z-10">
                <div className="group/item flex justify-between items-center p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-xl border border-rose-100/50 dark:border-rose-900/30 hover:shadow-md transition-all duration-300 hover:bg-white dark:hover:bg-slate-800 hover:border-rose-200 dark:hover:border-rose-800">
                  <span className="font-medium text-slate-600 dark:text-slate-400 group-hover/item:text-slate-900 dark:group-hover/item:text-slate-200 transition-colors">$10 more drop</span>
                  <span className="text-lg font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-3 py-1 rounded-lg border border-rose-100 dark:border-rose-800/50">{analysis.drop10?.toLocaleString() ?? '0'} USC</span>
                </div>

                <div className="group/item flex justify-between items-center p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-xl border border-rose-100/50 dark:border-rose-900/30 hover:shadow-md transition-all duration-300 hover:bg-white dark:hover:bg-slate-800 hover:border-rose-200 dark:hover:border-rose-800">
                  <span className="font-medium text-slate-600 dark:text-slate-400 group-hover/item:text-slate-900 dark:group-hover/item:text-slate-200 transition-colors">$25 more drop</span>
                  <span className="text-lg font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-3 py-1 rounded-lg border border-rose-100 dark:border-rose-800/50">{analysis.drop25?.toLocaleString() ?? '0'} USC</span>
                </div>

                <div className="group/item flex justify-between items-center p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-xl border border-rose-100/50 dark:border-rose-900/30 hover:shadow-md transition-all duration-300 hover:bg-white dark:hover:bg-slate-800 hover:border-rose-200 dark:hover:border-rose-800">
                  <span className="font-medium text-slate-600 dark:text-slate-400 group-hover/item:text-slate-900 dark:group-hover/item:text-slate-200 transition-colors">$50 more drop</span>
                  <span className="text-lg font-bold text-rose-800 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-3 py-1 rounded-lg border border-rose-100 dark:border-rose-800/50">{analysis.drop50?.toLocaleString() ?? '0'} USC</span>
                </div>

                <div className="group/item flex justify-between items-center p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-xl border border-rose-100/50 dark:border-rose-900/30 hover:shadow-md transition-all duration-300 hover:bg-white dark:hover:bg-slate-800 hover:border-rose-200 dark:hover:border-rose-800">
                  <span className="font-medium text-slate-600 dark:text-slate-400 group-hover/item:text-slate-900 dark:group-hover/item:text-slate-200 transition-colors">$100 more drop</span>
                  <span className="text-lg font-bold text-rose-900 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-3 py-1 rounded-lg border border-rose-100 dark:border-rose-800/50">{analysis.drop100?.toLocaleString() ?? '0'} USC</span>
                </div>
              </div>
            </div>

            {/* Key Numbers Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 border-2 border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <DollarSign className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Key Numbers</h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Total Lots Open:</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{analysis.totalLots}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Total Ounces:</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{analysis.totalOunces}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Exposure:</span>
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">{analysis.notionalUSC?.toLocaleString() ?? '0'} USC</span>
                </div>
              </div>
            </div>

            {/* Profit Potential Card */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/40 dark:to-emerald-900/30 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 border-2 border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-8 h-8 text-green-700 dark:text-green-400" />
                <h3 className="text-xl font-bold text-green-900 dark:text-green-100">Profit Potential</h3>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
                <div className="text-sm text-green-800 dark:text-green-400 font-medium mb-2">If ALL open positions close at Take Profit:</div>
                <div className="text-4xl font-bold text-green-900 dark:text-green-300">+{analysis.totalPotentialProfit?.toLocaleString() ?? '0'} USC</div>
                <div className="text-sm text-green-700 dark:text-green-500 mt-2">= ${((analysis.totalPotentialProfit ?? 0) / 100).toFixed(2)} USD</div>
              </div>
            </div>

            {/* Risk Assessment Card */}
            <div className={`rounded-xl shadow-lg p-6 border-2 ${getRiskColorClass(analysis.riskColor ?? 'green')}`}>
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-8 h-8" />
                <div>
                  <h3 className="text-xl font-bold">RISK LEVEL: {analysis.riskLevel}</h3>
                  <p className="text-sm opacity-80">Based on margin usage</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Margin Used:</span>
                  <span className="text-xl font-bold">{analysis.marginPercent}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Used Margin:</span>
                  <span className="text-lg font-semibold">{analysis.usedMargin?.toLocaleString() ?? '0'} USC</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Free Margin:</span>
                  <span className="text-lg font-semibold">
                    {Math.max(0, (analysis.currentEquity ?? 0) - (analysis.usedMargin ?? 0)).toLocaleString()} USC
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Equity Curve */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 border-2 border-slate-200 dark:border-slate-700 relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">Projected Equity Curve</h3>
                </div>
                <button
                  onClick={() => setShowEquityCurveInfo(true)}
                  className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
                  title="Learn how to use this chart"
                >
                  <Info className="w-5 h-5 text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                </button>
              </div>
              <EquityChart
                data={analysis.equityCurveData ?? []}
                marginCallEquity={(analysis.usedMargin ?? 0) * 0.5}
                balance={balanceUSC}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">Simulated equity as price drops from current level.</p>

              {/* Equity Curve Info Modal */}
              {showEquityCurveInfo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEquityCurveInfo(false)}>
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-transparent dark:border-slate-700" onClick={e => e.stopPropagation()}>
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                      <h3 className="text-xl font-bold text-slate-800 dark:text-white">Understanding the Equity Curve</h3>
                      <button onClick={() => setShowEquityCurveInfo(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition">
                        <X className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                      </button>
                    </div>
                    <div className="p-6 space-y-5 text-slate-700 dark:text-slate-300">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                          <span className="text-blue-500">📊</span> What is this chart?
                        </h4>
                        <p className="text-sm">This curve shows your <strong>projected account equity</strong> as the price drops from its current level. It simulates what happens to your account balance if the market moves against your grid positions.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                          <span className="text-blue-500">📖</span> How to read it
                        </h4>
                        <ul className="text-sm space-y-2">
                          <li><strong className="text-blue-600 dark:text-blue-400">Blue Line:</strong> Your equity curve - shows how your account equity changes</li>
                          <li><strong className="text-slate-600 dark:text-slate-400">Dashed Gray Line:</strong> Your starting balance reference</li>
                          <li><strong className="text-red-600 dark:text-red-400">Dashed Red Line:</strong> Danger zone - margin call territory</li>
                          <li><strong>X-Axis (→):</strong> Represents price dropping from left to right</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                          <span className="text-blue-500">⚡</span> Why it's useful
                        </h4>
                        <p className="text-sm mb-2">The curve <strong>steepens</strong> as price drops because:</p>
                        <ul className="text-sm space-y-1 list-disc list-inside text-slate-600 dark:text-slate-400">
                          <li>More grid levels get triggered, adding positions</li>
                          <li>Losses accumulate faster with more open positions</li>
                          <li>This visualizes the <em>accelerating risk</em> of grid strategies</li>
                        </ul>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          <strong>💡 Pro Tip:</strong> If the curve drops sharply, consider reducing your lot size or number of levels to flatten the curve and reduce risk.
                        </p>
                      </div>
                    </div>
                    <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl">
                      <button onClick={() => setShowEquityCurveInfo(false)} className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
                        Got it!
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Visual Grid Ladder */}
        {analysis && !analysis.noPositions && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 mb-6 border border-transparent dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-6 h-6 text-slate-700 dark:text-slate-400" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">Grid Levels Visualization</h3>
            </div>
            <GridLadder table={table} />
          </div>
        )}

        {/* Detailed Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 mb-6 border border-transparent dark:border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-slate-800 dark:text-white">Grid Level Details</h3>
            <button onClick={downloadCSV} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow">
              Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700">
                  <th className="p-3 text-left font-semibold dark:text-slate-200">#</th>
                  <th className="p-3 text-left font-semibold dark:text-slate-200">Status</th>
                  <th className="p-3 text-left font-semibold dark:text-slate-200">Price Level</th>
                  <th className="p-3 text-left font-semibold dark:text-slate-200">Lots Here</th>
                  <th className="p-3 text-left font-semibold dark:text-slate-200">Total Lots</th>
                  <th className="p-3 text-left font-semibold dark:text-slate-200">Total Oz</th>
                  <th className="p-3 text-left font-semibold dark:text-slate-200">Profit at TP</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.idx} className={`border-b border-slate-100 dark:border-slate-700 transition ${row.isTriggered ? 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30' : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                    <td className="p-3 font-medium dark:text-slate-200">{row.idx}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${row.isTriggered ? 'bg-green-200 dark:bg-green-900/50 text-green-900 dark:text-green-300' : 'bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-slate-300'}`}>
                        {row.isTriggered ? '✓ OPEN' : 'Waiting'}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-blue-700 dark:text-blue-400">${row.levelPrice}</td>
                    <td className="p-3 dark:text-slate-300">{row.lotsAtThisLevel}</td>
                    <td className="p-3 font-medium dark:text-slate-200">{row.cumulativeLots}</td>
                    <td className="p-3 dark:text-slate-300">{row.totalOunces}</td>
                    <td className="p-3 text-green-700 dark:text-green-400 font-semibold">+{row.potentialProfitIfAllClosed.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Warning Footer */}
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-300 dark:border-yellow-700 rounded-xl p-4 text-sm">
          <p className="font-bold text-yellow-900 dark:text-yellow-200 mb-2">⚠️ IMPORTANT DISCLAIMER:</p>
          <p className="text-yellow-800 dark:text-yellow-300">This calculator provides estimates only. Real trading involves spreads, commissions, swaps, and slippage. Grid trading can lead to rapid account loss in volatile markets. Always test with demo accounts first and never risk more than you can afford to lose.</p>
        </div>

      </div>

      {showModal && <CalculationModal onClose={() => setShowModal(false)} />}
    </div>
  );
}