import { useMemo, useState } from 'react';
import { AlertTriangle, TrendingDown, DollarSign, Target, Activity, Info, X } from 'lucide-react';

export default function App() {
  const [gridStartPrice, setGridStartPrice] = useState(2650);
  const [currentPrice, setCurrentPrice] = useState(2600);
  const [step, setStep] = useState(5);
  const [lotSize, setLotSize] = useState(0.1);
  const [levels, setLevels] = useState(20);
  const [tp, setTp] = useState(5);
  const [balanceUSC, setBalanceUSC] = useState(10000);
  const [leverage, setLeverage] = useState(2000);
  const [contractSize] = useState(1);
  const [showModal, setShowModal] = useState(false);

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

    const findMarginCallPrice = () => {
      let low = 0;
      let high = currentPrice;
      let marginCallPrice = 0;

      // Binary search for the price where Equity <= UsedMargin * StopOutLevel
      for (let i = 0; i < 20; i++) { // 20 iterations is enough for 2 decimal precision
        const mid = (low + high) / 2;

        // Calculate state at price 'mid'
        const triggeredAtMid = table.filter(r => mid <= r.levelPrice);

        if (triggeredAtMid.length === 0) {
          // No positions, safe
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
          // Margin call happens here or higher (earlier)
          marginCallPrice = mid;
          low = mid;
        } else {
          // Safe here, margin call is lower
          high = mid;
        }
      }
      return +marginCallPrice.toFixed(2);
    };

    const marginCallPrice = findMarginCallPrice();
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
      green: 'bg-green-100 border-green-300 text-green-900',
      yellow: 'bg-yellow-100 border-yellow-300 text-yellow-900',
      orange: 'bg-orange-100 border-orange-300 text-orange-900',
      red: 'bg-red-100 border-red-300 text-red-900'
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
      <div className="w-full h-48 bg-white rounded-lg border border-slate-200 p-2 relative overflow-hidden">
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
        <div className="absolute top-2 left-2 text-xs font-bold text-slate-500">Equity Curve</div>
        <div className="absolute bottom-2 right-2 text-xs text-slate-400">Price Drop →</div>
      </div>
    );
  };

  const GridLadder = ({ table }: { table: any[] }) => {
    const maxLots = Math.max(...table.map(r => r.lotsAtThisLevel));

    return (
      <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
        {table.map((row) => (
          <div key={row.idx} className="flex items-center gap-2 text-xs">
            <div className="w-12 text-right font-mono text-slate-500">${row.levelPrice}</div>
            <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
              <div
                className={`h-full transition-all ${row.isTriggered ? 'bg-green-500' : 'bg-slate-300'}`}
                style={{ width: `${(row.lotsAtThisLevel / maxLots) * 100}%` }}
              />
            </div>
            <div className="w-8 text-right text-slate-600">{row.lotsAtThisLevel}</div>
          </div>
        ))}
      </div>
    );
  };

  const CalculationModal = ({ onClose }: { onClose: () => void }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800">How Calculations Work</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full transition">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-4 text-slate-700">
          <div>
            <h4 className="font-bold text-slate-900 mb-1">Average Entry Price</h4>
            <p className="text-sm">Weighted average of all open positions. <br /><code className="bg-slate-100 px-1 rounded">Sum(Price * Lots) / Total Lots</code></p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 mb-1">Floating P/L</h4>
            <p className="text-sm">Profit or loss based on the difference between Current Price and Average Entry. <br /><code className="bg-slate-100 px-1 rounded">(Current Price - Avg Entry) * Total Ounces * 100</code></p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 mb-1">Margin Call Estimation</h4>
            <p className="text-sm">We use an iterative simulation (binary search) to find the exact price where your Equity drops to 50% of Used Margin. This accounts for new positions opening as price drops.</p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 mb-1">Equity Curve</h4>
            <p className="text-sm">The blue line shows your projected Equity as price drops. The steepening curve illustrates how risk accelerates in a grid strategy.</p>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl">
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
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-slate-800">XAU/USD Grid Risk Calculator</h1>
            <p className="text-slate-600">Enter your grid start price and current price to see real-time position status and risk analysis.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-semibold hover:bg-blue-100 transition"
          >
            <Info className="w-5 h-5" />
            How it works
          </button>
        </div>

        {/* Price Status Banner */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 mb-6 text-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm opacity-90">Grid Started At</div>
              <div className="text-3xl font-bold">${gridStartPrice.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm opacity-90">Current Price</div>
              <div className="text-3xl font-bold">${currentPrice.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm opacity-90">Price Movement</div>
              <div className="text-3xl font-bold">{priceDropped ? '-' : '+'}${priceChange.toLocaleString()}</div>
              <div className="text-sm opacity-90">{priceDropped ? '↓' : '↑'} {priceChangePercent}%</div>
            </div>
          </div>
        </div>

        {/* Input Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-slate-800">Strategy Parameters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Grid Start Price (USD)</div>
              <input type="number" value={gridStartPrice} onChange={e => setGridStartPrice(parseFloat(e.target.value) || 0)} className="w-full p-3 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none font-semibold" />
            </label>
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Current Market Price (USD)</div>
              <input type="number" value={currentPrice} onChange={e => setCurrentPrice(parseFloat(e.target.value) || 0)} className="w-full p-3 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none font-semibold" />
            </label>
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Grid Step (USD)</div>
              <input type="number" value={step} onChange={e => setStep(parseFloat(e.target.value) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Lot Size per Order</div>
              <input type="number" step="0.01" value={lotSize} onChange={e => setLotSize(parseFloat(e.target.value) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Number of Levels</div>
              <input type="number" value={levels} onChange={e => setLevels(parseInt(e.target.value) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Take Profit (USD/oz)</div>
              <input type="number" value={tp} onChange={e => setTp(parseFloat(e.target.value) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Balance (USC)</div>
              <input type="number" value={balanceUSC} onChange={e => setBalanceUSC(parseFloat(e.target.value) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Leverage</div>
              <input type="number" value={leverage} onChange={e => setLeverage(parseFloat(e.target.value) || 1)} className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none" />
            </label>
          </div>
        </div>

        {/* Position Status */}
        {analysis && !analysis.noPositions && (
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 mb-6 text-white">
            <div className="flex items-center gap-3 mb-3">
              <Activity className="w-8 h-8" />
              <h3 className="text-2xl font-bold">Active Positions Status</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm opacity-90">Triggered Levels</div>
                <div className="text-3xl font-bold">{analysis.numTriggered} / {levels}</div>
              </div>
              <div>
                <div className="text-sm opacity-90">Current Equity</div>
                <div className="text-3xl font-bold">{analysis.currentEquity?.toLocaleString() ?? '0'}</div>
              </div>
              <div>
                <div className="text-sm opacity-90">Floating P/L</div>
                <div className={`text-3xl font-bold ${(analysis.currentFloatingPL ?? 0) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {(analysis.currentFloatingPL ?? 0) >= 0 ? '+' : ''}{(analysis.currentFloatingPL ?? 0).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm opacity-90">Avg Entry Price</div>
                <div className="text-3xl font-bold">${analysis.avgEntryFixed?.toLocaleString() ?? '0'}</div>
              </div>
            </div>
          </div>
        )}

        {analysis && analysis.noPositions && (
          <div className="bg-blue-100 border-2 border-blue-300 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-700" />
              <div>
                <h3 className="text-xl font-bold text-blue-900">No Positions Active Yet</h3>
                <p className="text-blue-800">Current price (${currentPrice}) is still above your first grid level (${gridStartPrice.toFixed(2)}). Positions will trigger when price drops to this level.</p>
              </div>
            </div>
          </div>
        )}

        {/* Critical Analysis Dashboard */}
        {analysis && !analysis.noPositions && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* Price Levels Card */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6 border-2 border-blue-200">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-8 h-8 text-blue-700" />
                <h3 className="text-xl font-bold text-blue-900">Critical Price Levels</h3>
              </div>

              <div className="space-y-3">
                <div className="bg-white/70 p-3 rounded-lg">
                  <div className="text-sm text-green-800 font-medium">Break Even Price</div>
                  <div className="text-2xl font-bold text-green-900">${analysis.breakEvenPrice?.toLocaleString() ?? '0'}</div>
                  <div className="text-xs text-green-700 mt-1">Avg Entry Level</div>
                </div>
                <div className="bg-white/70 p-3 rounded-lg">
                  <div className="text-sm text-emerald-800 font-medium">Profit Target (TP)</div>
                  <div className="text-2xl font-bold text-emerald-900">${analysis.profitTargetPrice?.toLocaleString() ?? '0'}</div>
                  <div className="text-xs text-emerald-700 mt-1">Avg Entry + TP</div>
                </div>
                <div className="bg-white/70 p-3 rounded-lg">
                  <div className="text-sm text-red-800 font-medium">Estimated Margin Call</div>
                  <div className="text-2xl font-bold text-red-900">${analysis.marginCallPrice?.toLocaleString() ?? '0'}</div>
                  <div className="text-xs text-red-700 mt-1">~${analysis.maxSafeDrop} drop from current</div>
                </div>
                <div className="bg-white/70 p-3 rounded-lg">
                  <div className="text-sm text-slate-800 font-medium">Lowest Triggered Level</div>
                  <div className="text-2xl font-bold text-slate-900">${analysis.lowestTriggered.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Drawdown Scenarios Card */}
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl shadow-lg p-6 border-2 border-red-200">
              <div className="flex items-center gap-3 mb-4">
                <TrendingDown className="w-8 h-8 text-red-700" />
                <h3 className="text-xl font-bold text-red-900">If Price Drops Further</h3>
              </div>

              <div className="space-y-3 text-sm">
                <div className="bg-white/70 p-3 rounded-lg flex justify-between items-center">
                  <span className="font-medium text-slate-800">$10 more drop:</span>
                  <span className="text-lg font-bold text-red-700">{analysis.drop10?.toLocaleString() ?? '0'} USC</span>
                </div>
                <div className="bg-white/70 p-3 rounded-lg flex justify-between items-center">
                  <span className="font-medium text-slate-800">$25 more drop:</span>
                  <span className="text-lg font-bold text-red-700">{analysis.drop25?.toLocaleString() ?? '0'} USC</span>
                </div>
                <div className="bg-white/70 p-3 rounded-lg flex justify-between items-center">
                  <span className="font-medium text-slate-800">$50 more drop:</span>
                  <span className="text-lg font-bold text-red-800">{analysis.drop50?.toLocaleString() ?? '0'} USC</span>
                </div>
                <div className="bg-white/70 p-3 rounded-lg flex justify-between items-center">
                  <span className="font-medium text-slate-800">$100 more drop:</span>
                  <span className="text-lg font-bold text-red-900">{analysis.drop100?.toLocaleString() ?? '0'} USC</span>
                </div>
              </div>
            </div>

            {/* Key Numbers Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <DollarSign className="w-8 h-8 text-blue-600" />
                <h3 className="text-xl font-bold text-slate-800">Key Numbers</h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-medium">Total Lots Open:</span>
                  <span className="text-xl font-bold text-slate-900">{analysis.totalLots}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-medium">Total Ounces:</span>
                  <span className="text-xl font-bold text-slate-900">{analysis.totalOunces}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-medium">Exposure:</span>
                  <span className="text-lg font-semibold text-slate-900">{analysis.notionalUSC?.toLocaleString() ?? '0'} USC</span>
                </div>
              </div>
            </div>

            {/* Profit Potential Card */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-lg p-6 border-2 border-green-200">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-8 h-8 text-green-700" />
                <h3 className="text-xl font-bold text-green-900">Profit Potential</h3>
              </div>

              <div className="bg-white/70 p-4 rounded-lg">
                <div className="text-sm text-green-800 font-medium mb-2">If ALL open positions close at Take Profit:</div>
                <div className="text-4xl font-bold text-green-900">+{analysis.totalPotentialProfit?.toLocaleString() ?? '0'} USC</div>
                <div className="text-sm text-green-700 mt-2">= ${((analysis.totalPotentialProfit ?? 0) / 100).toFixed(2)} USD</div>
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
            <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <TrendingDown className="w-8 h-8 text-blue-600" />
                <h3 className="text-xl font-bold text-slate-800">Projected Equity Curve</h3>
              </div>
              <EquityChart
                data={analysis.equityCurveData ?? []}
                marginCallEquity={(analysis.usedMargin ?? 0) * 0.5}
                balance={balanceUSC}
              />
              <p className="text-xs text-slate-500 mt-2 text-center">Simulated equity as price drops from current level.</p>
            </div>

          </div>
        )}

        {/* Visual Grid Ladder */}
        {analysis && !analysis.noPositions && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-6 h-6 text-slate-700" />
              <h3 className="text-xl font-bold text-slate-800">Grid Levels Visualization</h3>
            </div>
            <GridLadder table={table} />
          </div>
        )}

        {/* Detailed Table */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-slate-800">Grid Level Details</h3>
            <button onClick={downloadCSV} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow">
              Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="p-3 text-left font-semibold">#</th>
                  <th className="p-3 text-left font-semibold">Status</th>
                  <th className="p-3 text-left font-semibold">Price Level</th>
                  <th className="p-3 text-left font-semibold">Lots Here</th>
                  <th className="p-3 text-left font-semibold">Total Lots</th>
                  <th className="p-3 text-left font-semibold">Total Oz</th>
                  <th className="p-3 text-left font-semibold">Profit at TP</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.idx} className={`border-b border-slate-100 transition ${row.isTriggered ? 'bg-green-50 hover:bg-green-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
                    <td className="p-3 font-medium">{row.idx}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${row.isTriggered ? 'bg-green-200 text-green-900' : 'bg-gray-200 text-gray-700'}`}>
                        {row.isTriggered ? '✓ OPEN' : 'Waiting'}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-blue-700">${row.levelPrice}</td>
                    <td className="p-3">{row.lotsAtThisLevel}</td>
                    <td className="p-3 font-medium">{row.cumulativeLots}</td>
                    <td className="p-3">{row.totalOunces}</td>
                    <td className="p-3 text-green-700 font-semibold">+{row.potentialProfitIfAllClosed.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Warning Footer */}
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
          <p className="font-bold text-yellow-900 mb-2">⚠️ IMPORTANT DISCLAIMER:</p>
          <p className="text-yellow-800">This calculator provides estimates only. Real trading involves spreads, commissions, swaps, and slippage. Grid trading can lead to rapid account loss in volatile markets. Always test with demo accounts first and never risk more than you can afford to lose.</p>
        </div>

      </div>

      {showModal && <CalculationModal onClose={() => setShowModal(false)} />}
    </div>
  );
}