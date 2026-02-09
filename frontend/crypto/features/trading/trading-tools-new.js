// Trading Tools - Vue.js App

const app = Vue.createApp({
    data() {
        return {
            activeTab: 'pl',
            cryptoList: [],
            showCryptoDropdown: '',
            showTradeDropdown: false,
            calculators: {
                pl: {
                    title: 'Profit/Loss Calculator',
                    short: 'P&L',
                    desc: 'Рассчитайте потенциальную прибыль или убыток от сделки с учетом цены входа, выхода и объема',
                    icon: 'bi-graph-up-arrow',
                    form: {
                        crypto: '',
                        cryptoName: 'Выберите криптовалюту',
                        tradeType: 'long',
                        entryPrice: '',
                        exitPrice: '',
                        amount: '1'
                    },
                    result: null
                },
                dca: {
                    title: 'DCA Calculator',
                    short: 'DCA',
                    desc: 'Dollar Cost Averaging - стратегия усреднения стоимости при покупке криптовалюты частями',
                    icon: 'bi-stack',
                    form: {
                        crypto: '',
                        cryptoName: 'Выберите криптовалюту',
                        investmentAmount: '1000',
                        numberOfOrders: '10',
                        priceDropPercent: '5'
                    },
                    result: null
                },
                stoploss: {
                    title: 'Stop-Loss Calculator',
                    short: 'Stop-Loss',
                    desc: 'Определите оптимальный размер позиции и уровень стоп-лосса с учетом риска',
                    icon: 'bi-shield-check',
                    form: {
                        crypto: '',
                        cryptoName: 'Выберите криптовалюту',
                        accountBalance: '10000',
                        riskPercent: '2',
                        entryPrice: '',
                        stopLossPrice: ''
                    },
                    result: null
                },
                riskreward: {
                    title: 'Risk/Reward Calculator',
                    short: 'Risk/Reward',
                    desc: 'Оцените соотношение риска к потенциальной прибыли для принятия взвешенных решений',
                    icon: 'bi-bar-chart-line',
                    form: {
                        crypto: '',
                        cryptoName: 'Выберите криптовалюту',
                        entryPrice: '',
                        stopLoss: '',
                        takeProfit: ''
                    },
                    result: null
                }
            }
        };
    },
    computed: {
        currentCalculator() {
            return this.calculators[this.activeTab];
        },
        filteredCryptoList() {
            return this.cryptoList.slice(0, 60);
        }
    },
    methods: {
        switchTab(tab) {
            this.activeTab = tab;
            this.showCryptoDropdown = '';
        },
        toggleCryptoDropdown(calcType) {
            this.showCryptoDropdown = this.showCryptoDropdown === calcType ? '' : calcType;
        },
        toggleTradeDropdown() {
            this.showTradeDropdown = !this.showTradeDropdown;
        },
        selectTradeType(type) {
            const calc = this.calculators.pl;
            if (!calc || !calc.form) return;
            calc.form.tradeType = type;
            this.showTradeDropdown = false;
        },
        async selectCrypto(crypto) {
            const calc = this.calculators[this.activeTab];
            calc.form.crypto = crypto.symbol;
            calc.form.cryptoName = `${crypto.name} (${crypto.symbol})`;
            this.showCryptoDropdown = '';
            
            try {
                const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${crypto.symbol}USDT`);
                const data = await response.json();
                const price = parseFloat(data.price).toFixed(2);
                
                if (!calc.form.entryPrice || calc.form.entryPrice === '') {
                    calc.form.entryPrice = price;
                }
            } catch (error) {
                console.error('Error loading price:', error);
            }
        },
        getCryptoIcon(symbol) {
            const id = symbol.toLowerCase();
            return `https://assets.coincap.io/assets/icons/${id}@2x.png`;
        },
        formatCurrency(value) {
            if (value == null || isNaN(value)) return '$0.00';
            const abs = Math.abs(value);
            const sign = value < 0 ? '-' : '';
            
            if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
            if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
            return `${sign}$${abs.toFixed(2)}`;
        },
        formatPercent(value) {
            if (value == null || isNaN(value)) return '0.00%';
            return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
        },
        increment(field, step = 1) {
            const calc = this.calculators[this.activeTab];
            if (!calc || !calc.form) return;
            const cur = parseFloat(calc.form[field]) || 0;
            const s = parseFloat(step) || 1;
            calc.form[field] = +(cur + s).toFixed(8);
        },
        decrement(field, step = 1) {
            const calc = this.calculators[this.activeTab];
            if (!calc || !calc.form) return;
            const cur = parseFloat(calc.form[field]) || 0;
            const s = parseFloat(step) || 1;
            calc.form[field] = +(cur - s).toFixed(8);
        },
        calculate() {
            const calc = this.calculators[this.activeTab];
            
            if (!calc.form.crypto) {
                alert('Пожалуйста, выберите криптовалюту');
                return;
            }
            
            switch (this.activeTab) {
                case 'pl':
                    this.calculatePL();
                    break;
                case 'dca':
                    this.calculateDCA();
                    break;
                case 'stoploss':
                    this.calculateStopLoss();
                    break;
                case 'riskreward':
                    this.calculateRiskReward();
                    break;
            }
        },
        calculatePL() {
            const form = this.calculators.pl.form;
            const entryPrice = parseFloat(form.entryPrice);
            const exitPrice = parseFloat(form.exitPrice);
            const amount = parseFloat(form.amount);
            
            if (!entryPrice || !exitPrice || !amount) {
                alert('Пожалуйста, заполните все поля');
                return;
            }
            
            let pnl, percentChange, roi;
            
            if (form.tradeType === 'long') {
                pnl = (exitPrice - entryPrice) * amount;
                percentChange = ((exitPrice - entryPrice) / entryPrice) * 100;
            } else {
                pnl = (entryPrice - exitPrice) * amount;
                percentChange = ((entryPrice - exitPrice) / entryPrice) * 100;
            }
            
            const investment = entryPrice * amount;
            roi = (pnl / investment) * 100;
            
            this.calculators.pl.result = {
                pnl,
                percentChange,
                roi,
                investment,
                exitValue: exitPrice * amount
            };
        },
        calculateDCA() {
            const form = this.calculators.dca.form;
            const investment = parseFloat(form.investmentAmount);
            const orders = parseInt(form.numberOfOrders);
            const dropPercent = parseFloat(form.priceDropPercent);
            const currentPrice = parseFloat(form.entryPrice || 0);
            
            if (!investment || !orders || !dropPercent || !currentPrice) {
                alert('Пожалуйста, заполните все поля');
                return;
            }
            
            const amountPerOrder = investment / orders;
            let totalCoins = 0;
            let totalSpent = 0;
            
            for (let i = 0; i < orders; i++) {
                const priceAtOrder = currentPrice * (1 - (dropPercent / 100) * i);
                const coinsAtOrder = amountPerOrder / priceAtOrder;
                totalCoins += coinsAtOrder;
                totalSpent += amountPerOrder;
            }
            
            const avgPrice = totalSpent / totalCoins;
            const savings = (currentPrice - avgPrice) * totalCoins;
            const savingsPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
            
            this.calculators.dca.result = {
                currentPrice,
                avgPrice,
                totalCoins,
                totalSpent,
                savings,
                savingsPercent
            };
        },
        calculateStopLoss() {
            const form = this.calculators.stoploss.form;
            const balance = parseFloat(form.accountBalance);
            const riskPercent = parseFloat(form.riskPercent);
            const entryPrice = parseFloat(form.entryPrice);
            const stopPrice = parseFloat(form.stopLossPrice);
            
            if (!balance || !riskPercent || !entryPrice || !stopPrice) {
                alert('Пожалуйста, заполните все поля');
                return;
            }
            
            const maxLoss = balance * (riskPercent / 100);
            const priceRisk = Math.abs(entryPrice - stopPrice);
            const positionSize = maxLoss / priceRisk;
            const coinsAmount = positionSize / entryPrice;
            const totalInvestment = coinsAmount * entryPrice;
            
            this.calculators.stoploss.result = {
                maxLoss,
                positionSize: totalInvestment,
                coinsAmount,
                riskPerCoin: priceRisk,
                riskPercent
            };
        },
        calculateRiskReward() {
            const form = this.calculators.riskreward.form;
            const entryPrice = parseFloat(form.entryPrice);
            const stopLoss = parseFloat(form.stopLoss);
            const takeProfit = parseFloat(form.takeProfit);
            
            if (!entryPrice || !stopLoss || !takeProfit) {
                alert('Пожалуйста, заполните все поля');
                return;
            }
            
            const risk = Math.abs(entryPrice - stopLoss);
            const reward = Math.abs(takeProfit - entryPrice);
            const ratio = reward / risk;
            
            const riskPercent = (risk / entryPrice) * 100;
            const rewardPercent = (reward / entryPrice) * 100;
            
            let assessment;
            if (ratio >= 3) assessment = 'Отличное соотношение';
            else if (ratio >= 2) assessment = 'Хорошее соотношение';
            else if (ratio >= 1.5) assessment = 'Приемлемое соотношение';
            else assessment = 'Высокий риск';
            
            this.calculators.riskreward.result = {
                ratio,
                risk,
                reward,
                riskPercent,
                rewardPercent,
                assessment
            };
        },
        loadCryptoList() {
            if (window.CRYPTO_INFO) {
                this.cryptoList = Object.entries(window.CRYPTO_INFO)
                    .map(([symbol, info]) => ({
                        symbol,
                        name: info.name,
                        rank: info.rank || 999
                    }))
                    .sort((a, b) => a.rank - b.rank);
            } else {
                this.cryptoList = [
                    { symbol: 'BTC', name: 'Bitcoin', rank: 1 },
                    { symbol: 'ETH', name: 'Ethereum', rank: 2 },
                    { symbol: 'BNB', name: 'BNB', rank: 3 },
                    { symbol: 'XRP', name: 'Ripple', rank: 4 },
                    { symbol: 'SOL', name: 'Solana', rank: 5 },
                    { symbol: 'ADA', name: 'Cardano', rank: 6 },
                    { symbol: 'DOGE', name: 'Dogecoin', rank: 7 },
                    { symbol: 'DOT', name: 'Polkadot', rank: 8 },
                    { symbol: 'MATIC', name: 'Polygon', rank: 9 },
                    { symbol: 'AVAX', name: 'Avalanche', rank: 10 },
                    { symbol: 'LINK', name: 'Chainlink', rank: 11 },
                    { symbol: 'LTC', name: 'Litecoin', rank: 12 }
                ];
                setTimeout(() => this.loadCryptoList(), 2000);
            }
        }
    },
    mounted() {
        this.loadCryptoList();
        
        document.addEventListener('click', (e) => {
            // Закрываем выпадающие списки при клике вне них
            if (!e.target.closest('.tools-crypto-selector')) {
                this.showCryptoDropdown = '';
            }
            if (!e.target.closest('.tools-select-replacement')) {
                this.showTradeDropdown = false;
            }
        });
    },
    template: `
        <div class="tools-background">
            <div class="tools-bg-grid"></div>
            <div class="tools-bg-orb tools-bg-orb-1"></div>
            <div class="tools-bg-orb tools-bg-orb-2"></div>
            <div class="tools-bg-orb tools-bg-orb-3"></div>
        </div>
        
        <div class="tools-container">
            <div class="tools-header">
                <h1 class="tools-title">
                    <i class="bi bi-calculator-fill"></i>
                    Торговые инструменты
                </h1>
                <p class="tools-subtitle">
                    Профессиональные калькуляторы для расчета прибыли, рисков и стратегий торговли криптовалютами
                </p>
            </div>
            
            <div class="tools-tabs">
                <button 
                    v-for="(calc, key) in calculators" 
                    :key="key"
                    :class="['tools-tab', { active: activeTab === key }]"
                    @click="switchTab(key)"
                >
                    <i :class="'bi ' + calc.icon"></i>
                    <span>{{ calc.short }}</span>
                </button>
            </div>
            
            <div class="tools-main-card">
                <div class="tools-card-header">
                    <h2 class="tools-card-title">
                        <i :class="'bi ' + currentCalculator.icon"></i>
                        {{ currentCalculator.title }}
                    </h2>
                    <p class="tools-card-desc">{{ currentCalculator.desc }}</p>
                </div>
                
                <div class="tools-card-body">
                    <div class="tools-layout">
                        <div class="tools-form-section">
                            <!-- Crypto Selector -->
                            <div class="tools-form-group">
                                <label class="tools-label">
                                    <i class="fas fa-coins"></i>
                                    Криптовалюта
                                </label>
                                <div class="tools-crypto-selector">
                                    <div class="tools-crypto-display" @click="toggleCryptoDropdown(activeTab)">
                                        <img 
                                            v-if="currentCalculator.form.crypto"
                                            :src="getCryptoIcon(currentCalculator.form.crypto)" 
                                            :alt="currentCalculator.form.crypto"
                                            class="tools-crypto-icon"
                                            @error="$event.target.src='https://ui-avatars.com/api/?name=' + currentCalculator.form.crypto + '&background=2563EB&color=fff'"
                                        >
                                        <i v-else class="fas fa-coins tools-crypto-icon" style="font-size: 2rem; color: var(--primary);"></i>
                                        <div class="tools-crypto-info">
                                            <div class="tools-crypto-name">{{ currentCalculator.form.cryptoName }}</div>
                                            <div v-if="currentCalculator.form.crypto" class="tools-crypto-symbol">{{ currentCalculator.form.crypto }}</div>
                                        </div>
                                        <i class="fas fa-chevron-down tools-crypto-arrow"></i>
                                    </div>
                                    
                                    <div v-if="showCryptoDropdown === activeTab" class="tools-crypto-dropdown">
                                        <div 
                                            v-for="crypto in filteredCryptoList" 
                                            :key="crypto.symbol"
                                            class="tools-crypto-item"
                                            @click="selectCrypto(crypto)"
                                        >
                                            <img 
                                                :src="getCryptoIcon(crypto.symbol)" 
                                                :alt="crypto.symbol"
                                                class="tools-crypto-icon"
                                                @error="$event.target.src='https://ui-avatars.com/api/?name=' + crypto.symbol + '&background=2563EB&color=fff'"
                                            >
                                            <div class="tools-crypto-info">
                                                <div class="tools-crypto-name">{{ crypto.name }}</div>
                                                <div class="tools-crypto-symbol">{{ crypto.symbol }}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- P&L Calculator Form -->
                            <template v-if="activeTab === 'pl'">
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-exchange-alt"></i>
                                        Тип сделки
                                    </label>
                                    <!-- Заменён на кастомный селектор, выглядит как выбор криптовалют -->
                                    <div class="tools-crypto-selector tools-select-replacement">
                                        <div class="tools-crypto-display" @click.stop="toggleTradeDropdown">
                                            <div class="tools-crypto-info">
                                                <div class="tools-crypto-name">
                                                    {{ currentCalculator.form.tradeType === 'long' ? 'Long (Покупка)' : 'Short (Продажа)' }}
                                                </div>
                                            </div>
                                            <i class="fas fa-chevron-down tools-crypto-arrow"></i>
                                        </div>
                                
                                        <div v-if="showTradeDropdown" class="tools-crypto-dropdown">
                                            <div class="tools-crypto-item" @click="selectTradeType('long')">
                                                <div class="tools-crypto-info">
                                                    <div class="tools-crypto-name">Long (Покупка)</div>
                                                    <div class="tools-crypto-symbol">Покупка</div>
                                                </div>
                                            </div>
                                            <div class="tools-crypto-item" @click="selectTradeType('short')">
                                                <div class="tools-crypto-info">
                                                    <div class="tools-crypto-name">Short (Продажа)</div>
                                                    <div class="tools-crypto-symbol">Продажа</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-sign-in-alt"></i>
                                        Цена входа
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.entryPrice"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите цену входа"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('entryPrice', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('entryPrice', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-sign-out-alt"></i>
                                        Цена выхода
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.exitPrice"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите цену выхода"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('exitPrice', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('exitPrice', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-coins"></i>
                                        Количество монет
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.amount"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите количество"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('amount', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('amount', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                            
                            <!-- DCA Calculator Form -->
                            <template v-if="activeTab === 'dca'">
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-dollar-sign"></i>
                                        Сумма инвестиций
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.investmentAmount"
                                            type="number"
                                            step="1"
                                            placeholder="Введите сумму"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('investmentAmount', 1)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('investmentAmount', 1)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-list-ol"></i>
                                        Количество ордеров
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.numberOfOrders"
                                            type="number"
                                            step="1"
                                            min="1"
                                            placeholder="Введите количество"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('numberOfOrders', 1)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('numberOfOrders', 1)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-percentage"></i>
                                        Падение цены (%)
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.priceDropPercent"
                                            type="number"
                                            step="0.1"
                                            placeholder="Введите процент падения"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('priceDropPercent', 0.1)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('priceDropPercent', 0.1)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-chart-line"></i>
                                        Текущая цена
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.entryPrice"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите текущую цену"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('entryPrice', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('entryPrice', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                            
                            <!-- Stop-Loss Calculator Form -->
                            <template v-if="activeTab === 'stoploss'">
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-wallet"></i>
                                        Баланс счета
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.accountBalance"
                                            type="number"
                                            step="1"
                                            placeholder="Введите баланс"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('accountBalance', 1)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('accountBalance', 1)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-percentage"></i>
                                        Риск (%)
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.riskPercent"
                                            type="number"
                                            step="0.1"
                                            placeholder="Введите процент риска"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('riskPercent', 0.1)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('riskPercent', 0.1)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-sign-in-alt"></i>
                                        Цена входа
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.entryPrice"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите цену входа"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('entryPrice', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('entryPrice', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-stop-circle"></i>
                                        Стоп-лосс
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.stopLossPrice"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите цену стоп-лосса"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('stopLossPrice', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('stopLossPrice', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                            
                            <!-- Risk/Reward Calculator Form -->
                            <template v-if="activeTab === 'riskreward'">
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-sign-in-alt"></i>
                                        Цена входа
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.entryPrice"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите цену входа"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('entryPrice', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('entryPrice', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-stop-circle"></i>
                                        Стоп-лосс
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.stopLoss"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите цену стоп-лосса"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('stopLoss', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('stopLoss', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="tools-form-group">
                                    <label class="tools-label">
                                        <i class="fas fa-flag-checkered"></i>
                                        Тейк-профит
                                    </label>
                                    <div class="number-input-wrapper">
                                        <input
                                            v-model="currentCalculator.form.takeProfit"
                                            type="number"
                                            step="0.01"
                                            placeholder="Введите цену тейк-профита"
                                            class="tools-input number-input"
                                        />
                                        <div class="number-steps">
                                            <button type="button" class="step-btn step-up" @click="increment('takeProfit', 0.01)"><i class="bi bi-chevron-up"></i></button>
                                            <button type="button" class="step-btn step-down" @click="decrement('takeProfit', 0.01)"><i class="bi bi-chevron-down"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                            
                            <button class="tools-btn" @click="calculate">
                                <i class="bi bi-calculator"></i>
                                <span>Рассчитать</span>
                            </button>
                        </div>
                        
                        <!-- Result Panel -->
                        <div v-if="currentCalculator.result" class="tools-result">
                            <!-- P&L Result -->
                            <template v-if="activeTab === 'pl'">
                                <div class="tools-result-header">
                                    <div class="tools-result-title">
                                        <i class="fas fa-chart-line"></i>
                                        Результат
                                    </div>
                                    <div :class="['tools-result-amount', currentCalculator.result.pnl >= 0 ? 'tools-positive' : 'tools-negative']">
                                        {{ formatCurrency(currentCalculator.result.pnl) }}
                                    </div>
                                </div>
                                <div class="tools-result-rows">
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Изменение цены:</span>
                                        <span :class="['tools-result-value', currentCalculator.result.percentChange >= 0 ? 'tools-positive' : 'tools-negative']">
                                            {{ formatPercent(currentCalculator.result.percentChange) }}
                                        </span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">ROI:</span>
                                        <span :class="['tools-result-value', currentCalculator.result.roi >= 0 ? 'tools-positive' : 'tools-negative']">
                                            {{ formatPercent(currentCalculator.result.roi) }}
                                        </span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Инвестиция:</span>
                                        <span class="tools-result-value">{{ formatCurrency(currentCalculator.result.investment) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Стоимость при выходе:</span>
                                        <span class="tools-result-value">{{ formatCurrency(currentCalculator.result.exitValue) }}</span>
                                    </div>
                                </div>
                            </template>
                            
                            <!-- DCA Result -->
                            <template v-if="activeTab === 'dca'">
                                <div class="tools-result-header">
                                    <div class="tools-result-title">
                                        <i class="fas fa-layer-group"></i>
                                        Результат DCA
                                    </div>
                                    <div class="tools-result-amount tools-positive">
                                        {{ formatCurrency(currentCalculator.result.savings) }}
                                    </div>
                                    <div style="text-align: center; color: var(--text-secondary); font-size: 1rem;">Экономия</div>
                                </div>
                                <div class="tools-result-rows">
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Текущая цена:</span>
                                        <span class="tools-result-value">{{ formatCurrency(currentCalculator.result.currentPrice) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Средняя цена:</span>
                                        <span class="tools-result-value">{{ formatCurrency(currentCalculator.result.avgPrice) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Всего монет:</span>
                                        <span class="tools-result-value">{{ currentCalculator.result.totalCoins.toFixed(4) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Экономия (%):</span>
                                        <span class="tools-result-value tools-positive">{{ formatPercent(currentCalculator.result.savingsPercent) }}</span>
                                    </div>
                                </div>
                            </template>
                            
                            <!-- Stop-Loss Result -->
                            <template v-if="activeTab === 'stoploss'">
                                <div class="tools-result-header">
                                    <div class="tools-result-title">
                                        <i class="fas fa-shield-alt"></i>
                                        Размер позиции
                                    </div>
                                    <div class="tools-result-amount tools-neutral" style="-webkit-text-fill-color: var(--text-primary);">
                                        {{ formatCurrency(currentCalculator.result.positionSize) }}
                                    </div>
                                </div>
                                <div class="tools-result-rows">
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Макс. убыток:</span>
                                        <span class="tools-result-value tools-negative">{{ formatCurrency(currentCalculator.result.maxLoss) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Количество монет:</span>
                                        <span class="tools-result-value">{{ currentCalculator.result.coinsAmount.toFixed(4) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Риск на монету:</span>
                                        <span class="tools-result-value">{{ formatCurrency(currentCalculator.result.riskPerCoin) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Риск (%):</span>
                                        <span class="tools-result-value">{{ currentCalculator.result.riskPercent }}%</span>
                                    </div>
                                </div>
                            </template>
                            
                            <!-- Risk/Reward Result -->
                            <template v-if="activeTab === 'riskreward'">
                                <div class="tools-result-header">
                                    <div class="tools-result-title">
                                        <i class="fas fa-balance-scale"></i>
                                        Соотношение R:R
                                    </div>
                                    <div class="tools-result-amount" :class="currentCalculator.result.ratio >= 2 ? 'tools-positive' : 'tools-negative'">
                                        1:{{ currentCalculator.result.ratio.toFixed(2) }}
                                    </div>
                                    <div style="text-align: center; color: var(--text-secondary); font-size: 1rem; margin-top: 0.5rem;">
                                        {{ currentCalculator.result.assessment }}
                                    </div>
                                </div>
                                <div class="tools-result-rows">
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Риск:</span>
                                        <span class="tools-result-value tools-negative">{{ formatCurrency(currentCalculator.result.risk) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Прибыль:</span>
                                        <span class="tools-result-value tools-positive">{{ formatCurrency(currentCalculator.result.reward) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Риск (%):</span>
                                        <span class="tools-result-value">{{ formatPercent(currentCalculator.result.riskPercent) }}</span>
                                    </div>
                                    <div class="tools-result-row">
                                        <span class="tools-result-label">Прибыль (%):</span>
                                        <span class="tools-result-value">{{ formatPercent(currentCalculator.result.rewardPercent) }}</span>
                                    </div>
                                </div>
                            </template>
                        </div>
                        <div v-else class="tools-result">
                            <div class="tools-empty-state">
                                <div class="tools-empty-icon">
                                    <i class="bi bi-calculator"></i>
                                </div>
                                <p class="tools-empty-text">Заполните данные и нажмите "Рассчитать"</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
});

// Монтируем приложение после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const element = document.getElementById('tradingToolsApp');
        if (element) {
            try {
                app.mount('#tradingToolsApp');
                console.log('Trading Tools App mounted successfully');
            } catch (error) {
                console.error('Error mounting Trading Tools App:', error);
            }
        } else {
            console.error('Element #tradingToolsApp not found');
        }
    });
} else {
    const element = document.getElementById('tradingToolsApp');
    if (element) {
        try {
            app.mount('#tradingToolsApp');
            console.log('Trading Tools App mounted successfully');
        } catch (error) {
            console.error('Error mounting Trading Tools App:', error);
        }
    } else {
        console.error('Element #tradingToolsApp not found');
    }
}
