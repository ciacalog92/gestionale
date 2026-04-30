// Application State - Using in-memory storage instead of localStorage due to sandboxed environment
const appState = {
  orders: [],
  clients: [],
  parts: [],
  partsFolders: [],
  repairPriceList: [],
  refurbishedDevices: [],
  evaluations: [],
  invoices: [],
  receipts: [],
  settings: {
    companyName: 'Fixit Repair Express',
    companyAddress: 'Via Roma 123, 20100 Milano',
    companyPhone: '02-1234567',
    companyEmail: 'info@techrepair.it',
    companyVat: 'IT12345678901',
    laborCost: 35
  },
  isAuthenticated: false,
  orderClientFilterPhone: null,
  currentOrder: null,
  currentStep: 1,
  currentEvalStep: 1,
  currentEvaluation: null,
  orderCounter: 1,
  refurbishedCounter: 1,
  evaluationCounter: 1,
  invoiceCounter: 48,
  receiptCounter: 5,
  invoiceItems: [],
  receiptItems: []
};

// Simple session config (in minuti)
const SESSION_TIMEOUT_MINUTES = 60;
const SESSION_STORAGE_KEY = 'nowfixit_session';

// Device Data
const deviceData = {
  iPhone: ['iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15', 'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14', 'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone SE 2022', 'iPhone 11'],
  iPad: ['iPad Pro 12.9 (2024)', 'iPad Pro 11 (2024)', 'iPad Air (2024)', 'iPad 10.9', 'iPad Mini'],
  MacBook: ['MacBook Pro 16 M3', 'MacBook Pro 14 M3', 'MacBook Air M2 15', 'MacBook Air M2 13', 'MacBook Air M1'],
  'Apple Watch': ['Apple Watch Series 9', 'Apple Watch Ultra 2', 'Apple Watch SE 2023']
};

const storageCapacity = {
  iPhone: ['64GB', '128GB', '256GB', '512GB', '1TB'],
  iPad: ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'],
  MacBook: ['256GB', '512GB', '1TB', '2TB'],
  'Apple Watch': ['32GB', '64GB']
};

const gradeColors = {
  'A+': '#059669',
  'A': '#10b981',
  'B': '#eab308',
  'C': '#f97316'
};

const marketPrices = {
  'iPhone 15 Pro Max 256GB': 1100,
  'iPhone 15 Pro 256GB': 950,
  'iPhone 15 256GB': 750,
  'iPhone 14 Pro Max 256GB': 850,
  'iPhone 14 Pro 256GB': 720,
  'iPhone 14 256GB': 600,
  'iPhone 13 256GB': 480,
  'iPhone 12 256GB': 380,
  'iPhone SE 2022 128GB': 280,
  'iPad Pro 12.9 256GB': 800,
  'iPad Air 256GB': 520,
  'MacBook Air M2 256GB': 900,
  'Apple Watch Series 9': 320
};

// Status Colors
const statusColors = {
  'Preventivo': '#f59e0b',
  'In Attesa Approvazione': '#8b5cf6',
  'In Lavorazione': '#3b82f6',
  'In Attesa Ricambi': '#f97316',
  'Completato': '#10b981',
  'Consegnato': '#6b7280'
};

// ── Valutazione iPhone Engine ────────────────────────────────

function arrotondaAlTaglioCommerciale(valore) {
  const step = 5;
  return Math.round(valore / step) * step;
}

function calcolaValoreRicambi(input) {
  const priceKey = `${input.modello} ${input.memoriaGb}`;
  const basePrice = marketPrices[priceKey] || 0;
  return arrotondaAlTaglioCommerciale(basePrice * 0.25);
}

function valutaIphone(input) {
  const result = {
    esito: 'DA_VALUTARE',
    note: [],
    alert: [],
    coefficienti: {},
    valoreFinale: 0,
    valoreLordo: 0,
    valoreRicambi: 0
  };

  // 1) Controlli bloccanti
  if (input.activationLock) {
    result.esito = 'RIFIUTATO';
    result.note.push('Activation Lock presente');
    result.valoreFinale = 0;
    return result;
  }

  if (input.imeiBlacklist) {
    result.alert.push('IMEI blacklistato');
    if (input.modalitaValutazione === 'RICAMBI') {
      result.esito = 'SOLO_RICAMBI';
      result.valoreRicambi = calcolaValoreRicambi(input);
      result.valoreFinale = result.valoreRicambi;
    } else {
      result.esito = 'RIFIUTATO';
      result.valoreFinale = 0;
    }
    return result;
  }

  if (input.rateNonPagate) {
    result.alert.push('Possibile rischio amministrativo');
  }

  // 2) Coefficiente estetica  A/B/C/D
  const esteticaMap = { A: 1.00, B: 0.94, C: 0.85, D: 0.70 };
  let coeffEstetica = esteticaMap[input.statoEstetico];
  if (coeffEstetica == null) {
    coeffEstetica = 0.80;
    result.alert.push('Stato estetico non standard');
  }

  // 3) Coefficiente batteria
  let coeffBatteria;
  if (input.batteriaSalutePercent >= 90)      { coeffBatteria = 1.00; }
  else if (input.batteriaSalutePercent >= 85) { coeffBatteria = 0.95; }
  else if (input.batteriaSalutePercent >= 80) { coeffBatteria = 0.90; }
  else {
    coeffBatteria = 0.80;
    result.note.push('Batteria sotto soglia 80%');
  }
  if (input.cicliBatteria != null && input.cicliBatteria > 900) {
    coeffBatteria = Math.max(0, coeffBatteria - 0.03);
    result.note.push('Cicli batteria elevati');
  }

  // 4) Coefficiente funzionale
  let penalitaFunzionale = 0;
  if (!input.faceIdOk)        { penalitaFunzionale += 0.12; result.note.push('Face ID non funzionante'); }
  if (!input.trueToneOk)      { penalitaFunzionale += 0.03; result.note.push('True Tone assente/non funzionante'); }
  if (!input.displayOriginale){ penalitaFunzionale += 0.05; result.note.push('Display non originale o warning parti'); }
  if (!input.touchOk)         { penalitaFunzionale += 0.12; result.note.push('Touch difettoso'); }
  if (!input.fotocamereOk)    { penalitaFunzionale += 0.08; result.note.push('Fotocamere difettose'); }
  if (!input.ricaricaOk)      { penalitaFunzionale += 0.08; result.note.push('Ricarica non funzionante'); }
  if (!input.audioOk)         { penalitaFunzionale += 0.04; result.note.push('Audio difettoso'); }
  if (!input.microfonoOk)     { penalitaFunzionale += 0.04; result.note.push('Microfono difettoso'); }
  if (!input.reteOk)          { penalitaFunzionale += 0.10; result.note.push('Problema rete / baseband / SIM'); }
  const coeffFunzionale = Math.max(0.50, 1.00 - penalitaFunzionale);

  // 5) Penale amministrativa
  const penaleAdmin = input.rateNonPagate ? (input.valoreBase * 0.15) : 0;

  // 6) Calcolo lordo
  result.valoreLordo = input.valoreBase * coeffEstetica * coeffBatteria * coeffFunzionale;

  // 7) Valore netto (può essere negativo: indica perdita)
  const valoreNetto = result.valoreLordo - input.costoRipristinoStimato - input.margineMinimo - penaleAdmin;
  const valoreNettoArrotondato = arrotondaAlTaglioCommerciale(Math.max(0, valoreNetto));

  // 8) Esito finale
  if (valoreNetto <= 0) {
    if (input.modalitaValutazione === 'RICAMBI') {
      result.esito = 'SOLO_RICAMBI';
      result.valoreRicambi = calcolaValoreRicambi(input);
      result.valoreFinale = result.valoreRicambi;
    } else {
      result.esito = 'NON_CONVENIENTE';
      result.note.push(`Margine insufficiente: netto stimato €${valoreNetto.toFixed(2)}`);
      result.valoreFinale = valoreNettoArrotondato;
    }
  } else {
    result.esito = 'RITIRO_OK';
    result.valoreFinale = valoreNettoArrotondato;
  }

  // 9) Salva coefficienti
  result.coefficienti = { estetica: coeffEstetica, batteria: coeffBatteria, funzionale: coeffFunzionale, penaleAdmin };

  return result;
}

// ─────────────────────────────────────────────────────────────

// Initialize App
const app = {
  // Simple frontend-only auth (to be replaced with real backend auth later)
  credentials: {
    username: 'admin',
    password: 'fixit!'
  },

  showAppShell() {
    const loginPage = document.getElementById('login-page');
    const header = document.getElementById('appHeader');
    const appsMenu = document.getElementById('appsMenu');
    const mainContent = document.getElementById('mainContent');

    if (loginPage) loginPage.style.display = 'none';
    if (header) header.style.display = '';
    if (appsMenu) appsMenu.style.display = '';
    if (mainContent) mainContent.style.display = '';
  },

  handleLogin() {
    // Use a timeout to ensure DOM is fully loaded
    setTimeout(() => {
      const loginForm = document.getElementById('loginForm');
      if (!loginForm) {
        console.error('Login form not found');
        return;
      }

      // Remove existing listener to prevent duplicates
      loginForm.removeEventListener('submit', this.loginHandler);
      
      // Create and store the login handler
      this.loginHandler = (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const username = formData.get('username');
        const password = formData.get('password');

        console.log('Login attempt:', { username, password: '***' });

        if (username === this.credentials.username && password === this.credentials.password) {
          console.log('Login successful');
          appState.isAuthenticated = true;
          this.startSession();
          this.showAppShell();
          this.init();
          this.showToast('Accesso effettuato', 'success');
        } else {
          console.log('Login failed');
          this.showToast('Credenziali non valide', 'error');
        }
      };

      // Add the event listener
      loginForm.addEventListener('submit', this.loginHandler);
      console.log('Login handler attached');
    }, 100);
  },

  init() {
    this.initializeData();
    this.setupEventListeners();
    this.renderDashboard();
    this.loadSavedTheme();
  },

  setupEventListeners() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const pageName = item.dataset.page;
        if (!pageName) return;

        this.showPage(pageName);
        navItems.forEach((navItem) => navItem.classList.remove('active'));
        item.classList.add('active');
      });
    });
  },

  loadSavedTheme() {
    try {
      const savedTheme = localStorage.getItem('nowfixit_theme');
      const themeIcon = document.getElementById('themeIcon');
      
      if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        if (themeIcon) themeIcon.textContent = '🌞';
      } else {
        document.body.removeAttribute('data-theme');
        if (themeIcon) themeIcon.textContent = '🌙';
      }
    } catch (e) {
      console.warn('Impossibile caricare il tema salvato', e);
    }
  },

  // Caricamento listino riparazioni iPhone dal CSV
  loadRepairPriceList() {
    // Parser helper: converte "469,00 €" o "235 €" in numero
    const parsePrice = (str) => {
      if (!str || str.trim() === '' || str.includes('-')) return null;
      const cleaned = str.replace(/€/g, '').replace(/,/g, '.').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    };

    // CSV completo del listino (MODELLO;RICAMBIO;PREZZO;PREZZO IN PROMO;PREZZO 2^ LAVORAZIONE)
    const csvData = `15 PRO MAX;DISPLAY;;469,00 €;235 €
14 PRO MAX;DISPLAY;459,00 €;439,00 €;220 €
16 PRO MAX;SCOCCA COMPLETA;;399,00 €;200 €
15 PRO;DISPLAY;;395,00 €;198 €
16 PRO MAX;RIGENERAZIONE DISPLAY;;389,00 €;195 €
15 PRO MAX;SCOCCA COMPLETA;;379,00 €;190 €
16 Plus;SCOCCA COMPLETA;;379,00 €;190 €
16 PRO;SCOCCA COMPLETA;;379,00 €;190 €
15 PRO;SCOCCA COMPLETA;;349,00 €;175 €
14 PRO;DISPLAY;;335,00 €;168 €
16;SCOCCA COMPLETA;;329,00 €;165 €
15 Plus;DISPLAY;355,00 €;315,00 €;158 €
16 Plus;RIGENERAZIONE DISPLAY;;305,00 €;153 €
16 PRO;RIGENERAZIONE DISPLAY;;305,00 €;153 €
15 PRO MAX;RIGENERAZIONE DISPLAY;;299,00 €;150 €
16 PRO;MB E REC. LIQUIDI;;299,00 €;150 €
16 PRO MAX;MB E REC. LIQUIDI;;299,00 €;150 €
16 PRO MAX;FACE ID;;299,00 €;150 €
15;DISPLAY;319,00 €;289,00 €;145 €
15 Plus;SCOCCA COMPLETA;;289,00 €;145 €
15 PRO;RIGENERAZIONE DISPLAY;;289,00 €;145 €
16 Plus;FACE ID;;289,00 €;145 €
13 PRO MAX;DISPLAY;305,00 €;285,00 €;143 €
14 PRO MAX;RIGENERAZIONE DISPLAY;;279,00 €;140 €
16 PRO MAX;FOTOCAMERA POSTERIORE;;279,00 €;195 €
15;SCOCCA COMPLETA;;259,00 €;130 €
16;FACE ID;;259,00 €;130 €
16 Plus;MB E REC. LIQUIDI;;259,00 €;130 €
16 PRO;FOTOCAMERA POSTERIORE;;259,00 €;181 €
16 PRO;FACE ID;;259,00 €;130 €
16;MB E REC. LIQUIDI;;249,00 €;125 €
15 PRO;FACE ID;299,00 €;249,00 €;125 €
15 PRO MAX;FACE ID;299,00 €;249,00 €;125 €
16 PRO;TELAIO;;249,00 €;125 €
16 PRO MAX;TELAIO;;249,00 €;125 €
14 Plus;DISPLAY;275,00 €;245,00 €;123 €
15;FACE ID;259,00 €;239,00 €;120 €
14 PRO MAX;SCOCCA COMPLETA;;239,00 €;120 €
15 Plus;FACE ID;289,00 €;239,00 €;120 €
15 PRO MAX;TELAIO;;239,00 €;120 €
16;RIGENERAZIONE DISPLAY;;229,00 €;115 €
13 PRO;DISPLAY;249,00 €;229,00 €;115 €
14 Plus;SCOCCA COMPLETA;;229,00 €;115 €
14 PRO;RIGENERAZIONE DISPLAY;;229,00 €;115 €
14 PRO;SCOCCA COMPLETA;;229,00 €;115 €
15 Plus;RIGENERAZIONE DISPLAY;;229,00 €;115 €
15 PRO;TELAIO;;229,00 €;115 €
16 Plus;VETRO POSTERIORE;;229,00 €;115 €
16 PRO MAX;VETRO POSTERIORE;;229,00 €;115 €
12 PRO MAX;DISPLAY;265,00 €;225,00 €;113 €
15;RIGENERAZIONE DISPLAY;;219,00 €;110 €
13 PRO MAX;SCOCCA COMPLETA;;219,00 €;110 €
15 PRO;MB E REC. LIQUIDI;;219,00 €;110 €
15 PRO MAX;MB E REC. LIQUIDI;;219,00 €;110 €
14;SCOCCA COMPLETA;;209,00 €;105 €
14;FACE ID;259,00 €;209,00 €;105 €
12 PRO MAX;SCOCCA COMPLETA;;209,00 €;105 €
13 PRO;SCOCCA COMPLETA;;209,00 €;105 €
13 PRO MAX;RIGENERAZIONE DISPLAY;;209,00 €;105 €
14 Plus;FACE ID;289,00 €;209,00 €;105 €
14 PRO;FACE ID;259,00 €;209,00 €;105 €
14 PRO MAX;FACE ID;299,00 €;209,00 €;105 €
15 Plus;MB E REC. LIQUIDI;;209,00 €;105 €
16 Plus;TELAIO;;209,00 €;105 €
13;FACE ID;259,00 €;199,00 €;100 €
13;SCOCCA COMPLETA;;199,00 €;100 €
14;DISPLAY;229,00 €;199,00 €;100 €
15;MB E REC. LIQUIDI;;199,00 €;100 €
16;VETRO POSTERIORE;;199,00 €;100 €
16;TELAIO;;199,00 €;100 €
13 PRO;FACE ID;259,00 €;199,00 €;100 €
13 PRO MAX;FACE ID;289,00 €;199,00 €;100 €
15 PRO MAX;FOTOCAMERA POSTERIORE;;199,00 €;139 €
15 PRO MAX;VETRO POSTERIORE;;199,00 €;100 €
16 PRO;VETRO POSTERIORE;;199,00 €;100 €
16;FOTOCAMERA POSTERIORE;;189,00 €;132 €
12 PRO;SCOCCA COMPLETA;;189,00 €;95 €
13 MINI;SCOCCA COMPLETA;;189,00 €;95 €
13 MINI;FACE ID;239,00 €;189,00 €;95 €
13 PRO;RIGENERAZIONE DISPLAY;;189,00 €;95 €
14 Plus;RIGENERAZIONE DISPLAY;;189,00 €;95 €
15 PRO;FOTOCAMERA POSTERIORE;;189,00 €;132 €
16 Plus;FOTOCAMERA POSTERIORE;;189,00 €;132 €
13;DISPLAY;199,00 €;179,00 €;90 €
14;RIGENERAZIONE DISPLAY;;179,00 €;90 €
11 PRO MAX;SCOCCA COMPLETA;;179,00 €;90 €
13 MINI;DISPLAY;199,00 €;179,00 €;90 €
14 PRO;MB E REC. LIQUIDI;;179,00 €;90 €
14 PRO MAX;VETRO POSTERIORE;;179,00 €;90 €
14 PRO MAX;MB E REC. LIQUIDI;;179,00 €;90 €
15 Plus;TELAIO;;179,00 €;90 €
12;SCOCCA COMPLETA;;169,00 €;85 €
13;RIGENERAZIONE DISPLAY;;169,00 €;85 €
11 PRO;SCOCCA COMPLETA;;169,00 €;85 €
12 PRO MAX;RIGENERAZIONE DISPLAY;;169,00 €;85 €
13 MINI;RIGENERAZIONE DISPLAY;;169,00 €;85 €
13 PRO;MB E REC. LIQUIDI;;169,00 €;85 €
13 PRO MAX;VETRO POSTERIORE;;169,00 €;85 €
13 PRO MAX;MB E REC. LIQUIDI;;169,00 €;85 €
14 PRO;VETRO POSTERIORE;;169,00 €;85 €
14 PRO MAX;FOTOCAMERA POSTERIORE;;169,00 €;118 €
15 Plus;VETRO POSTERIORE;;169,00 €;85 €
15 PRO;VETRO POSTERIORE;;169,00 €;85 €
13;MB E REC. LIQUIDI;;159,00 €;80 €
14;MB E REC. LIQUIDI;;159,00 €;80 €
15;VETRO POSTERIORE;;159,00 €;80 €
15;TELAIO;;159,00 €;80 €
12 MINI;SCOCCA COMPLETA;;159,00 €;80 €
12 MINI;DISPLAY;199,00 €;159,00 €;80 €
12 PRO;DISPLAY;179,00 €;159,00 €;80 €
12 PRO;FOTOCAMERA POSTERIORE;;159,00 €;111 €
12 PRO MAX;FOTOCAMERA POSTERIORE;;159,00 €;111 €
12 PRO MAX;VETRO POSTERIORE;;159,00 €;80 €
12 PRO MAX;MB E REC. LIQUIDI;;159,00 €;80 €
12 PRO MAX;FACE ID;;159,00 €;80 €
13 MINI;MB E REC. LIQUIDI;;159,00 €;80 €
13 PRO;VETRO POSTERIORE;;159,00 €;80 €
13 PRO MAX;FOTOCAMERA POSTERIORE;;159,00 €;111 €
14 Plus;TELAIO;;159,00 €;80 €
14 Plus;MB E REC. LIQUIDI;169,00 €;159,00 €;80 €
14 PRO;FOTOCAMERA POSTERIORE;;159,00 €;111 €
15 Plus;FOTOCAMERA POSTERIORE;;159,00 €;111 €
16 PRO MAX;DOCK;;159,00 €;80 €
11;SCOCCA COMPLETA;;149,00 €;75 €
12;RIGENERAZIONE DISPLAY;;149,00 €;75 €
12;DISPLAY;169,00 €;149,00 €;75 €
16;DOCK;;149,00 €;75 €
11 PRO MAX;DISPLAY;179,00 €;149,00 €;75 €
12 PRO;RIGENERAZIONE DISPLAY;;149,00 €;75 €
12 PRO;VETRO POSTERIORE;;149,00 €;75 €
12 PRO;MB E REC. LIQUIDI;;149,00 €;75 €
12 PRO;FACE ID;;149,00 €;75 €
13 PRO;FOTOCAMERA POSTERIORE;;149,00 €;104 €
16 Plus;DOCK;;149,00 €;75 €
16 PRO;DOCK;;149,00 €;75 €
13;VETRO POSTERIORE;;139,00 €;70 €
14;FOTOCAMERA POSTERIORE;;139,00 €;97 €
15;FOTOCAMERA POSTERIORE;;139,00 €;97 €
11 PRO;DISPLAY;169,00 €;139,00 €;70 €
11 PRO MAX;VETRO POSTERIORE;;139,00 €;70 €
12 MINI;RIGENERAZIONE DISPLAY;;139,00 €;70 €
14 Plus;FOTOCAMERA POSTERIORE;149,00 €;139,00 €;97 €
SE 3;SCOCCA COMPLETA;;139,00 €;70 €
X;SCOCCA COMPLETA;;139,00 €;70 €
XR;SCOCCA COMPLETA;;139,00 €;70 €
XS;SCOCCA COMPLETA;;139,00 €;70 €
XS MAX;SCOCCA COMPLETA;;139,00 €;70 €
12;VETRO POSTERIORE;;129,00 €;65 €
12;MB E REC. LIQUIDI;;129,00 €;65 €
12;FACE ID;;129,00 €;65 €
14;TELAIO;;129,00 €;65 €
11 PRO;FOTOCAMERA POSTERIORE;;129,00 €;90 €
11 PRO;VETRO POSTERIORE;;129,00 €;65 €
11 PRO MAX;FOTOCAMERA POSTERIORE;;129,00 €;90 €
12 MINI;FACE ID;;129,00 €;65 €
12 MINI;MB E REC. LIQUIDI;;129,00 €;65 €
13 MINI;VETRO POSTERIORE;;129,00 €;65 €
16 PRO MAX;ALTRI DANNI;;129,00 €;65 €
XS MAX;DISPLAY;159,00 €;129,00 €;65 €
13;FOTOCAMERA POSTERIORE;;119,00 €;83 €
16;ALTRI DANNI;;119,00 €;60 €
11 PRO;MB E REC. LIQUIDI;;119,00 €;60 €
11 PRO;FACE ID;;119,00 €;60 €
11 PRO MAX;MB E REC. LIQUIDI;;119,00 €;60 €
11 PRO MAX;FACE ID;;119,00 €;60 €
12 MINI;VETRO POSTERIORE;;119,00 €;60 €
14 Plus;VETRO POSTERIORE;;119,00 €;60 €
15 Plus;DOCK;;119,00 €;60 €
16 Plus;ALTRI DANNI;;119,00 €;60 €
16 PRO;ALTRI DANNI;;119,00 €;60 €
XS;DISPLAY;149,00 €;119,00 €;60 €
XS MAX;MB E REC. LIQUIDI;;119,00 €;60 €
11;DISPLAY;129,00 €;109,00 €;55 €
11;VETRO POSTERIORE;;109,00 €;55 €
11;MB E REC. LIQUIDI;;109,00 €;55 €
11;FACE ID;;109,00 €;55 €
12;FOTOCAMERA POSTERIORE;;109,00 €;76 €
14;VETRO POSTERIORE;;109,00 €;55 €
15;DOCK;;109,00 €;55 €
11 PRO;DOCK;;109,00 €;55 €
11 PRO MAX;DOCK;;109,00 €;55 €
12 MINI;FOTOCAMERA POSTERIORE;;109,00 €;76 €
13 MINI;FOTOCAMERA POSTERIORE;;109,00 €;76 €
15 PRO;DOCK;;109,00 €;55 €
15 PRO MAX;DOCK;;109,00 €;55 €
SE 2;SCOCCA COMPLETA;;109,00 €;55 €
SE 2;MB E REC. LIQUIDI;;109,00 €;55 €
SE 3;VETRO POSTERIORE;;109,00 €;55 €
SE 3;MB E REC. LIQUIDI;;109,00 €;55 €
X;DISPLAY;139,00 €;109,00 €;55 €
X;VETRO POSTERIORE;;109,00 €;55 €
X;MB E REC. LIQUIDI;;109,00 €;55 €
X;FACE ID;;109,00 €;55 €
XR;VETRO POSTERIORE;;109,00 €;55 €
XR;MB E REC. LIQUIDI;;109,00 €;55 €
XR;FACE ID;;109,00 €;55 €
XS;VETRO POSTERIORE;;109,00 €;55 €
XS;MB E REC. LIQUIDI;;109,00 €;55 €
XS;FACE ID;;109,00 €;55 €
XS MAX;VETRO POSTERIORE;;109,00 €;55 €
XS MAX;FACE ID;119,00 €;109,00 €;55 €
14 PRO;DOCK;;99,00 €;50 €
14 PRO MAX;DOCK;;99,00 €;50 €
15 Plus;ALTRI DANNI;;99,00 €;50 €
XR;DISPLAY;119,00 €;99,00 €;50 €
8;MB E REC. LIQUIDI;;89,00 €;45 €
11;FOTOCAMERA POSTERIORE;;89,00 €;62 €
12;DOCK;;89,00 €;45 €
15;ALTRI DANNI;;89,00 €;45 €
12 MINI;DOCK;;89,00 €;45 €
12 PRO;DOCK;;89,00 €;45 €
12 PRO MAX;DOCK;;89,00 €;45 €
13 MINI;DOCK;;89,00 €;45 €
13 PRO;DOCK;;89,00 €;45 €
13 PRO MAX;DOCK;;89,00 €;45 €
14 Plus;DOCK;;89,00 €;45 €
14 PRO;ALTRI DANNI;;89,00 €;45 €
14 PRO MAX;ALTRI DANNI;;89,00 €;45 €
15 PRO;ALTRI DANNI;;89,00 €;45 €
15 PRO MAX;ALTRI DANNI;;89,00 €;45 €
8 Plus;DISPLAY;;89,00 €;45 €
8 Plus;MB E REC. LIQUIDI;;89,00 €;45 €
SE 2;VETRO POSTERIORE;;89,00 €;45 €
SE 3;DISPLAY;109,00 €;89,00 €;45 €
XR;FOTOCAMERA POSTERIORE;;89,00 €;62 €
XS;FOTOCAMERA POSTERIORE;;89,00 €;62 €
XS MAX;FOTOCAMERA POSTERIORE;;89,00 €;62 €
8;DISPLAY;;79,00 €;40 €
11;DOCK;;79,00 €;40 €
12;ALTRI DANNI;;79,00 €;40 €
13;DOCK;;79,00 €;40 €
14;BATTERIA;;79,00 €;59 €
14;DOCK;;79,00 €;40 €
15;BATTERIA;;79,00 €;59 €
16;BATTERIA;;79,00 €;59 €
11 PRO;ALTRI DANNI;;79,00 €;40 €
11 PRO MAX;ALTRI DANNI;;79,00 €;40 €
12 MINI;ALTRI DANNI;;79,00 €;40 €
12 PRO;ALTRI DANNI;;79,00 €;40 €
12 PRO MAX;ALTRI DANNI;;79,00 €;40 €
13 MINI;ALTRI DANNI;;79,00 €;40 €
13 PRO;ALTRI DANNI;;79,00 €;40 €
13 PRO MAX;ALTRI DANNI;;79,00 €;40 €
14 Plus;BATTERIA;;79,00 €;59 €
14 Plus;ALTRI DANNI;;79,00 €;40 €
14 PRO;BATTERIA;;79,00 €;59 €
14 PRO MAX;BATTERIA;;79,00 €;59 €
15 Plus;BATTERIA;;79,00 €;59 €
15 PRO;BATTERIA;;79,00 €;59 €
15 PRO MAX;BATTERIA;;79,00 €;59 €
16 Plus;BATTERIA;;79,00 €;59 €
16 PRO;BATTERIA;;79,00 €;59 €
16 PRO;VETRINO FOTOCAMERA;;79,00 €;40 €
16 PRO MAX;BATTERIA;;79,00 €;59 €
16 PRO MAX;VETRINO FOTOCAMERA;;79,00 €;40 €
SE 2;DISPLAY;99,00 €;79,00 €;40 €
SE 3;FOTOCAMERA POSTERIORE;;79,00 €;55 €
X;FOTOCAMERA POSTERIORE;;79,00 €;55 €
7;MB E REC. LIQUIDI;;69,00 €;35 €
11;ALTRI DANNI;;69,00 €;35 €
12;BATTERIA;;69,00 €;49 €
13;BATTERIA;;69,00 €;49 €
13;ALTRI DANNI;;69,00 €;35 €
14;ALTRI DANNI;;69,00 €;35 €
15;MANUTENZIONE DOCK/EAR;;69,00 €;35 €
16;VETRINO FOTOCAMERA;;69,00 €;35 €
16;MANUTENZIONE DOCK/EAR;;69,00 €;35 €
11 PRO;BATTERIA;;69,00 €;49 €
11 PRO MAX;BATTERIA;;69,00 €;49 €
12 MINI;BATTERIA;;69,00 €;49 €
12 PRO;BATTERIA;;69,00 €;49 €
12 PRO MAX;BATTERIA;;69,00 €;49 €
13 MINI;BATTERIA;;69,00 €;49 €
13 PRO;BATTERIA;;69,00 €;49 €
13 PRO MAX;BATTERIA;;69,00 €;49 €
15 Plus;MANUTENZIONE DOCK/EAR;;69,00 €;35 €
15 PRO;VETRINO FOTOCAMERA;;69,00 €;35 €
15 PRO;MANUTENZIONE DOCK/EAR;;69,00 €;35 €
15 PRO MAX;VETRINO FOTOCAMERA;;69,00 €;35 €
15 PRO MAX;MANUTENZIONE DOCK/EAR;;69,00 €;35 €
16 Plus;VETRINO FOTOCAMERA;;69,00 €;35 €
16 Plus;MANUTENZIONE DOCK/EAR;;69,00 €;35 €
16 PRO;MANUTENZIONE DOCK/EAR;;69,00 €;35 €
16 PRO MAX;MANUTENZIONE DOCK/EAR;;69,00 €;35 €
7 Plus;DISPLAY;;69,00 €;35 €
7 Plus;MB E REC. LIQUIDI;;69,00 €;35 €
SE 2;FOTOCAMERA POSTERIORE;;69,00 €;48 €
SE 3;DOCK;79,00 €;69,00 €;35 €
XR;DOCK;;69,00 €;35 €
XS MAX;DOCK;;69,00 €;35 €
7;DISPLAY;;59,00 €;30 €
11;BATTERIA;;59,00 €;39 €
15;VETRINO FOTOCAMERA;;59,00 €;30 €
14 PRO;VETRINO FOTOCAMERA;;59,00 €;30 €
14 PRO MAX;VETRINO FOTOCAMERA;;59,00 €;30 €
15 Plus;VETRINO FOTOCAMERA;;59,00 €;30 €
5S/SE/6;MB E REC. LIQUIDI;;59,00 €;30 €
6P/6S;MB E REC. LIQUIDI;;59,00 €;30 €
6S Plus;DISPLAY;;59,00 €;30 €
6S Plus;MB E REC. LIQUIDI;;59,00 €;30 €
SE 2;DOCK;79,00 €;59,00 €;30 €
SE 2;ALTRI DANNI;;59,00 €;30 €
SE 3;ALTRI DANNI;;59,00 €;30 €
X;BATTERIA;69,00 €;59,00 €;39 €
X;DOCK;79,00 €;59,00 €;30 €
X;ALTRI DANNI;;59,00 €;30 €
XR;BATTERIA;69,00 €;59,00 €;39 €
XR;ALTRI DANNI;;59,00 €;30 €
XS;BATTERIA;69,00 €;59,00 €;39 €
XS;DOCK;89,00 €;59,00 €;30 €
XS;ALTRI DANNI;69,00 €;59,00 €;30 €
XS MAX;BATTERIA;69,00 €;59,00 €;39 €
XS MAX;ALTRI DANNI;69,00 €;59,00 €;30 €
7;BATTERIA;;49,00 €;29 €
8;BATTERIA;;49,00 €;29 €
12;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
13;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
14;VETRINO FOTOCAMERA;;49,00 €;25 €
14;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
12 MINI;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
12 PRO;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
12 PRO MAX;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
13 MINI;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
13 PRO;VETRINO FOTOCAMERA;;49,00 €;25 €
13 PRO;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
13 PRO MAX;VETRINO FOTOCAMERA;;49,00 €;25 €
13 PRO MAX;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
14 Plus;VETRINO FOTOCAMERA;;49,00 €;25 €
14 Plus;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
14 PRO;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
14 PRO MAX;MANUTENZIONE DOCK/EAR;;49,00 €;25 €
6P/6S;DISPLAY;;49,00 €;25 €
7 Plus;BATTERIA;;49,00 €;29 €
8 Plus;BATTERIA;;49,00 €;29 €
SE 2;BATTERIA;;49,00 €;29 €
SE 3;BATTERIA;;49,00 €;29 €
7;ALTRI DANNI;;39,00 €;20 €
8;ALTRI DANNI;;39,00 €;20 €
11;VETRINO FOTOCAMERA;;39,00 €;20 €
12;VETRINO FOTOCAMERA;;39,00 €;20 €
13;VETRINO FOTOCAMERA;;39,00 €;20 €
11 PRO;VETRINO FOTOCAMERA;;39,00 €;20 €
11 PRO MAX;VETRINO FOTOCAMERA;;39,00 €;20 €
12 MINI;VETRINO FOTOCAMERA;;39,00 €;20 €
12 PRO;VETRINO FOTOCAMERA;;39,00 €;20 €
12 PRO MAX;VETRINO FOTOCAMERA;;39,00 €;20 €
13 MINI;VETRINO FOTOCAMERA;;39,00 €;20 €
5S/SE/6;DISPLAY;;39,00 €;20 €
6P/6S;BATTERIA;;39,00 €;19 €
6S Plus;BATTERIA;;39,00 €;19 €
7 Plus;ALTRI DANNI;;39,00 €;20 €
8 Plus;ALTRI DANNI;;39,00 €;20 €
SE 2;VETRINO FOTOCAMERA;;39,00 €;20 €
SE 3;VETRINO FOTOCAMERA;;39,00 €;20 €
X;VETRINO FOTOCAMERA;;39,00 €;20 €
XR;VETRINO FOTOCAMERA;;39,00 €;20 €
XS;VETRINO FOTOCAMERA;;39,00 €;20 €
XS MAX;VETRINO FOTOCAMERA;;39,00 €;20 €
ACCESSORI;COVER MagSafe;;30,00 €;15 €
7;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
8;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
11;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
11 PRO;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
11 PRO MAX;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
5S/SE/6;BATTERIA;;29,00 €;19 €
5S/SE/6;ALTRI DANNI;;29,00 €;15 €
5S/SE/6;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
6P/6S;ALTRI DANNI;;29,00 €;15 €
6P/6S;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
6S Plus;ALTRI DANNI;;29,00 €;15 €
6S Plus;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
7 Plus;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
8 Plus;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
SE 2;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
SE 3;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
X;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
XR;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
XS;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
XS MAX;MANUTENZIONE DOCK/EAR;;29,00 €;15 €
ACCESSORI;COVER TPU;;20,00 €;10 €
ACCESSORI;GLASS;;20,00 €;10 €`;

    const lines = csvData.split('\n');
    const list = [];

    lines.forEach(line => {
      const parts = line.split(';');
      if (parts.length < 5) return;

      const model = (parts[0] || '').trim();
      const repairType = (parts[1] || '').trim();
      const price = parsePrice(parts[2]);
      const promoPrice = parsePrice(parts[3]);
      const secondWorkPrice = parsePrice(parts[4]);

      if (!model || !repairType) return;

      list.push({
        model,
        repairType,
        price,
        promoPrice,
        secondWorkPrice
      });
    });

    appState.repairPriceList = list;
  },

  // Session handling
  startSession() {
    const session = {
      startedAt: Date.now(),
      lastActivity: Date.now()
    };
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('Impossibile salvare la sessione', e);
    }

    this.setupActivityTracking();
  },

  setupActivityTracking() {
    const updateActivity = () => {
      try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        const session = JSON.parse(raw);
        session.lastActivity = Date.now();
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch (e) {
        console.warn('Impossibile aggiornare la sessione', e);
      }
    };

    ['click', 'keypress', 'mousemove', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, updateActivity, { passive: true });
    });
  },

  restoreSessionIfValid() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw);
      if (!session || !session.lastActivity) return false;

      const diffMinutes = (Date.now() - session.lastActivity) / 1000 / 60;
      if (diffMinutes > SESSION_TIMEOUT_MINUTES) {
        // Session expired
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return false;
      }

      appState.isAuthenticated = true;
      this.showAppShell();
      this.setupActivityTracking();
      this.init();
      return true;
    } catch (e) {
      console.warn('Errore nel ripristino della sessione', e);
      return false;
    }
  },

  logout() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn('Impossibile cancellare la sessione', e);
    }

    appState.isAuthenticated = false;

    // Mostro di nuovo la schermata di login e nascondo l'app
    const loginPage = document.getElementById('login-page');
    const header = document.getElementById('appHeader');
    const mainContent = document.getElementById('mainContent');
    const appsMenu = document.getElementById('appsMenu');

    if (loginPage) loginPage.style.display = '';
    if (header) header.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';
    if (appsMenu) appsMenu.style.display = 'none';
  },

  toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const themeIcon = document.getElementById('themeIcon');
    
    if (currentTheme === 'dark') {
      // Switch to light mode
      document.body.removeAttribute('data-theme');
      if (themeIcon) themeIcon.textContent = '🌙';
      try {
        localStorage.setItem('nowfixit_theme', 'light');
      } catch (e) {
        console.warn('Impossibile salvare il tema', e);
      }
    } else {
      // Switch to dark mode
      document.body.setAttribute('data-theme', 'dark');
      if (themeIcon) themeIcon.textContent = '🌞';
      try {
        localStorage.setItem('nowfixit_theme', 'dark');
      } catch (e) {
        console.warn('Impossibile salvare il tema', e);
      }
    }
  },

  initializeData() {
    // Initialize parts catalog from repair price list
    // First load the price list so we can extract real physical parts
    this.loadRepairPriceList();

    // Define which repair types are REAL PHYSICAL PARTS (not services/repairs)
    const physicalParts = [
      'DISPLAY',
      'BATTERIA',
      'FOTOCAMERA POSTERIORE',
      'VETRO POSTERIORE',
      'SCOCCA COMPLETA',
      'FACE ID',
      'DOCK',
      'TELAIO',
      'VETRINO FOTOCAMERA',
      'COVER MagSafe',
      'COVER TPU',
      'GLASS'
    ];

    // Generate detailed parts catalog: one part per model + repair type combination
    const parts = [];
    let id = 1;
    const partsMap = new Map(); // key: "model|repairType"

    appState.repairPriceList.forEach(item => {
      // Skip if not a physical part
      if (!physicalParts.includes(item.repairType)) return;

      const key = `${item.model}|${item.repairType}`;
      if (partsMap.has(key)) return; // Already added

      // Use the first available price (prefer base price, then promo)
      const price = item.price != null ? item.price : (item.promoPrice != null ? item.promoPrice : 0);

      parts.push({
        id: id++,
        name: item.repairType,
        model: item.model,
        price: price,
        stock: 0,
        minStock: 1
      });

      partsMap.set(key, true);
    });

    // Sort by model first, then by part name
    appState.parts = parts.sort((a, b) => {
      const modelCompare = a.model.localeCompare(b.model);
      if (modelCompare !== 0) return modelCompare;
      return a.name.localeCompare(b.name);
    });

    // Try to load custom parts/folders from localStorage (overrides auto-generated)
    try {
      const storedParts = localStorage.getItem('nowfixit_parts');
      if (storedParts) {
        const parsed = JSON.parse(storedParts);
        if (Array.isArray(parsed)) {
          // Filter out legacy _FOLDER_ placeholders if present
          appState.parts = parsed.filter(p => p && p.name !== '_FOLDER_');
        }
      }
      const storedFolders = localStorage.getItem('nowfixit_parts_folders');
      if (storedFolders) {
        const parsed = JSON.parse(storedFolders);
        if (Array.isArray(parsed)) {
          appState.partsFolders = parsed;
        }
      }
    } catch (e) {
      console.warn('Impossibile leggere parts/folders da localStorage:', e);
    }

    // Ensure all part models are tracked in folders (migration safety)
    const partModels = new Set(appState.parts.map(p => p.model).filter(Boolean));
    partModels.forEach(m => {
      if (!appState.partsFolders.includes(m)) appState.partsFolders.push(m);
    });

    // Try to load orders from localStorage first
    let loadedFromStorage = false;
    try {
      const storedOrders = localStorage.getItem('nowfixit_orders');
      if (storedOrders) {
        const parsed = JSON.parse(storedOrders);
        if (Array.isArray(parsed)) {
          appState.orders = parsed;
          // Set next order id based on max existing id
          const maxId = parsed.reduce((max, o) => Math.max(max, o.id || 0), 0);
          appState.orderCounter = maxId + 1;
          loadedFromStorage = true;
        }
      }
    } catch (e) {
      console.warn('Impossibile leggere gli ordini da localStorage:', e);
    }

    // If nothing in storage, use sample orders
    if (!loadedFromStorage) {
      appState.orders = [
        {
          id: 1,
          number: 'WO-20241029-001',
          customer: {
            name: 'Mario',
            surname: 'Rossi',
            phone: '339-1234567',
            email: 'mario.rossi@email.com',
            notes: ''
          },
          device: {
            type: 'iPhone',
            model: 'iPhone 14',
            serial: 'ABC123456789',
            condition: 'Display completamente rotto',
            accessories: 'Caricatore, Cover'
          },
          problem: {
            category: 'Display rotto/schermo crepato',
            description: 'Lo schermo è completamente crepato dopo una caduta',
            priority: 'Media'
          },
          status: 'In Lavorazione',
          createdAt: new Date('2024-10-29T09:30:00'),
          timeline: [
            { status: 'Preventivo', date: new Date('2024-10-29T09:30:00') },
            { status: 'In Lavorazione', date: new Date('2024-10-29T10:15:00') }
          ],
          quote: {
            items: [{ partId: 1, partName: 'Display LCD', price: 80, quantity: 1 }],
            labor: 1,
            subtotal: 115,
            vat: 25.3,
            total: 140.3
          },
          internalNotes: 'Cliente ha fretta, completare entro domani'
        },
        {
          id: 2,
          number: 'WO-20241029-002',
          customer: {
            name: 'Anna',
            surname: 'Bianchi',
            phone: '349-7654321',
            email: 'anna.bianchi@email.com',
            notes: ''
          },
          device: {
            type: 'iPad',
            model: 'iPad Air',
            serial: 'DEF987654321',
            condition: 'Buone condizioni generali',
            accessories: 'Nessuno'
          },
          problem: {
            category: 'Batteria scarica/durata ridotta',
            description: 'La batteria si scarica molto velocemente',
            priority: 'Bassa'
          },
          status: 'Preventivo',
          createdAt: new Date('2024-10-29T11:15:00'),
          timeline: [
            { status: 'Preventivo', date: new Date('2024-10-29T11:15:00') }
          ],
          quote: null,
          internalNotes: ''
        }
      ];

      appState.orderCounter = 3;

      // Save initial sample orders so they persist as well
      try {
        localStorage.setItem('nowfixit_orders', JSON.stringify(appState.orders));
      } catch (e) {
        console.warn('Impossibile salvare gli ordini iniziali in localStorage:', e);
      }
    }

    // Initialize refurbished devices
    appState.refurbishedDevices = [
      {
        id: 1,
        tipo: 'iPhone',
        modello: 'iPhone 14 Pro',
        capacita: '256GB',
        colore: 'Nero',
        seriale: 'FKH8923KL2',
        grado: 'A',
        batteria: 92,
        accessori: ['caricabatterie', 'cavo', 'scatola'],
        prezzo: 699,
        stato: 'Disponibile',
        dataInserimento: new Date('2024-10-15'),
        note: ''
      },
      {
        id: 2,
        tipo: 'iPhone',
        modello: 'iPhone 13',
        capacita: '128GB',
        colore: 'Blu',
        seriale: 'DFG7821MN9',
        grado: 'B',
        batteria: 85,
        accessori: ['cavo'],
        prezzo: 429,
        stato: 'Disponibile',
        dataInserimento: new Date('2024-10-20'),
        note: ''
      },
      {
        id: 3,
        tipo: 'iPad',
        modello: 'iPad Air',
        capacita: '256GB',
        colore: 'Grigio Siderale',
        seriale: 'PLM3456RT8',
        grado: 'A+',
        batteria: 98,
        accessori: ['caricabatterie', 'cavo', 'scatola'],
        prezzo: 489,
        stato: 'Riservato',
        dataInserimento: new Date('2024-10-25'),
        note: ''
      },
      {
        id: 4,
        tipo: 'Apple Watch',
        modello: 'Apple Watch Series 9',
        capacita: '32GB',
        colore: 'Argento',
        seriale: 'AWX9876YZ3',
        grado: 'A',
        batteria: 94,
        accessori: ['caricabatterie', 'scatola'],
        prezzo: 289,
        stato: 'Disponibile',
        dataInserimento: new Date('2024-10-27'),
        note: ''
      }
    ];
    appState.refurbishedCounter = 5;

    // Initialize evaluations
    appState.evaluations = [
      {
        id: 1,
        numero: 'VAL-20241025-001',
        data: new Date('2024-10-25T14:30:00'),
        cliente: {
          nome: 'Luca',
          cognome: 'Verdi',
          telefono: '348-9876543',
          email: 'luca.verdi@email.com'
        },
        dispositivo: {
          tipo: 'iPhone',
          modello: 'iPhone 13',
          capacita: '128GB',
          colore: 'Nero',
          seriale: 'VERIFY12345'
        },
        punteggioEstetico: 28,
        punteggioFunzionale: 45,
        punteggioAccessori: 12,
        batteriaSalute: 87,
        prezzoOfferto: 410,
        stato: 'Accettata',
        note: 'Dispositivo in buone condizioni generali'
      },
      {
        id: 2,
        numero: 'VAL-20241028-002',
        data: new Date('2024-10-28T10:15:00'),
        cliente: {
          nome: 'Giulia',
          cognome: 'Neri',
          telefono: '347-5554321',
          email: 'giulia.neri@email.com'
        },
        dispositivo: {
          tipo: 'iPad',
          modello: 'iPad Air',
          capacita: '64GB',
          colore: 'Argento',
          seriale: 'IPADAIR987'
        },
        punteggioEstetico: 25,
        punteggioFunzionale: 40,
        punteggioAccessori: 8,
        batteriaSalute: 82,
        prezzoOfferto: 285,
        stato: 'In Attesa',
        note: 'Graffi evidenti sul retro'
      }
    ];
    appState.evaluationCounter = 3;

    // Initialize sample invoices
    appState.invoices = [
      {
        id: 1,
        numero: 'FT-2024-0045',
        data: new Date('2024-10-15'),
        tipo: 'Fattura',
        cliente: {
          nome: 'Mario Rossi',
          indirizzo: 'Via Garibaldi 45',
          cap: '20121',
          citta: 'Milano',
          provincia: 'MI',
          codiceFiscale: 'RSSMRA85M01F205X',
          partitaIva: '',
          codiceSdi: 'XXXXXXX'
        },
        righe: [
          { descrizione: 'Riparazione Display iPhone 14', quantita: 1, prezzoUnitario: 80, iva: 22, sconto: 0 },
          { descrizione: 'Manodopera tecnica (1h)', quantita: 1, prezzoUnitario: 35, iva: 22, sconto: 0 }
        ],
        imponibile: 115,
        totaleIva: 25.30,
        totale: 140.30,
        metodoPagamento: 'Carta di Credito/Debito',
        statoPagamento: 'Pagata',
        dataPagamento: new Date('2024-10-15')
      },
      {
        id: 2,
        numero: 'FT-2024-0046',
        data: new Date('2024-10-22'),
        tipo: 'Fattura',
        cliente: {
          nome: 'Tech Solutions SRL',
          indirizzo: 'Corso Europa 100',
          cap: '20141',
          citta: 'Milano',
          provincia: 'MI',
          partitaIva: '12345678901',
          codiceSdi: 'ABCDEFG'
        },
        righe: [
          { descrizione: 'iPhone 13 128GB Ricondizionato Grado A', quantita: 2, prezzoUnitario: 450, iva: 22, sconto: 5 },
          { descrizione: 'Cover protettiva iPhone', quantita: 2, prezzoUnitario: 15, iva: 22, sconto: 0 }
        ],
        imponibile: 885,
        totaleIva: 194.70,
        totale: 1079.70,
        metodoPagamento: 'Bonifico Bancario',
        statoPagamento: 'Non Pagata',
        scadenza: new Date('2024-11-21')
      },
      {
        id: 3,
        numero: 'FT-2024-0047',
        data: new Date('2024-10-28'),
        tipo: 'Fattura',
        cliente: {
          nome: 'Anna Bianchi',
          indirizzo: 'Via Torino 23',
          cap: '20123',
          citta: 'Milano',
          provincia: 'MI',
          codiceFiscale: 'BNCNNA90D45F205K'
        },
        righe: [
          { descrizione: 'Sostituzione batteria iPad Air', quantita: 1, prezzoUnitario: 65, iva: 22, sconto: 0 },
          { descrizione: 'Manodopera (0.5h)', quantita: 1, prezzoUnitario: 17.50, iva: 22, sconto: 0 }
        ],
        imponibile: 82.50,
        totaleIva: 18.15,
        totale: 100.65,
        metodoPagamento: 'Contanti',
        statoPagamento: 'Pagata',
        dataPagamento: new Date('2024-10-28')
      }
    ];
    appState.invoiceCounter = 48;

    // Initialize sample receipts
    appState.receipts = [
      {
        id: 1,
        numero: 'SC-20241029-001',
        data: new Date('2024-10-29T09:15:00'),
        cliente: 'Cliente generico',
        righe: [
          { descrizione: 'Cover iPhone 14', quantita: 1, prezzoTotale: 15.00 },
          { descrizione: 'Pellicola protettiva', quantita: 1, prezzoTotale: 8.00 }
        ],
        totale: 23.00,
        metodoPagamento: 'Contanti'
      },
      {
        id: 2,
        numero: 'SC-20241029-002',
        data: new Date('2024-10-29T10:30:00'),
        cliente: 'Luca Verdi',
        righe: [
          { descrizione: 'iPhone 12 128GB Ricondizionato Grado B', quantita: 1, prezzoTotale: 380.00 }
        ],
        totale: 380.00,
        metodoPagamento: 'Carta di Credito/Debito'
      },
      {
        id: 3,
        numero: 'SC-20241029-003',
        data: new Date('2024-10-29T11:00:00'),
        cliente: '',
        righe: [
          { descrizione: 'Caricabatterie USB-C Apple', quantita: 1, prezzoTotale: 25.00 },
          { descrizione: 'Cavo Lightning 1m', quantita: 2, prezzoTotale: 20.00 }
        ],
        totale: 45.00,
        metodoPagamento: 'Carta di Credito/Debito'
      },
      {
        id: 4,
        numero: 'SC-20241029-004',
        data: new Date('2024-10-29T11:20:00'),
        cliente: 'Marco Gialli',
        righe: [
          { descrizione: 'Riparazione Display iPhone 13', quantita: 1, prezzoTotale: 95.00 }
        ],
        totale: 95.00,
        metodoPagamento: 'Contanti'
      }
    ];
    appState.receiptCounter = 5;

    // Initialize clients from orders
    this.updateClientsList();
  },

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.showPage(page);
        
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
      });
    });

    // Menu toggle
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
          sidebar.classList.toggle('collapsed');
        }
      });
    }

    // Device type change
    const deviceTypeSelect = document.querySelector('select[name="deviceType"]');
    if (deviceTypeSelect) {
      deviceTypeSelect.addEventListener('change', (e) => {
        this.updateDeviceModels(e.target.value);
      });
    }

    // Refurbished device type change
    document.addEventListener('change', (e) => {
      if (!e.target || !e.target.name) return;

      if (e.target.name === 'refType') {
        this.updateRefurbishedModels(e.target.value);
      }
      if (e.target.name === 'evalDeviceType') {
        this.updateEvalModels(e.target.value);
      }
      if (e.target.name === 'evalWarranty') {
        const warrantyMonths = document.getElementById('warrantyMonths');
        if (!warrantyMonths) return;
        if (e.target.value === '3') {
          warrantyMonths.style.display = 'block';
        } else {
          warrantyMonths.style.display = 'none';
        }
      }
    });

    // Refurbished filters
    const refTypeFilter = document.getElementById('refurbishedTypeFilter');
    const refGradeFilter = document.getElementById('refurbishedGradeFilter');
    const refStatusFilter = document.getElementById('refurbishedStatusFilter');
    const refSearchInput = document.getElementById('refurbishedSearchInput');
    
    if (refTypeFilter) refTypeFilter.addEventListener('change', () => this.renderRefurbishedDevices());
    if (refGradeFilter) refGradeFilter.addEventListener('change', () => this.renderRefurbishedDevices());
    if (refStatusFilter) refStatusFilter.addEventListener('change', () => this.renderRefurbishedDevices());
    if (refSearchInput) refSearchInput.addEventListener('input', () => this.renderRefurbishedDevices());

    // Invoice filters
    const invoiceStatusFilter = document.getElementById('invoiceStatusFilter');
    if (invoiceStatusFilter) invoiceStatusFilter.addEventListener('change', () => this.renderInvoicesList());

    // VAT period filter
    const vatPeriodFilter = document.getElementById('vatPeriodFilter');
    if (vatPeriodFilter) vatPeriodFilter.addEventListener('change', () => this.renderVATRegisters());

    // Evaluation filters
    const evalStatusFilter = document.getElementById('evaluationStatusFilter');
    const evalSearchInput = document.getElementById('evaluationSearchInput');
    
    if (evalStatusFilter) evalStatusFilter.addEventListener('change', () => this.renderEvaluationsList());
    if (evalSearchInput) evalSearchInput.addEventListener('input', () => this.renderEvaluationsList());

    // Add refurbished form
    const addRefurbishedForm = document.getElementById('addRefurbishedForm');
    if (addRefurbishedForm) {
      addRefurbishedForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addRefurbishedDevice();
      });
    }

    // Evaluation form
    const evaluationForm = document.getElementById('evaluationForm');
    if (evaluationForm) {
      evaluationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEvaluation();
      });
      
      // Score calculation
      evaluationForm.addEventListener('change', (e) => {
        if (e.target.dataset.points) {
          this.calculateEvaluationScores();
        }
      });
    }

    // Price adjustment slider
    const priceAdjustment = document.getElementById('priceAdjustment');
    if (priceAdjustment) {
      priceAdjustment.addEventListener('input', (e) => {
        document.getElementById('adjustmentValue').textContent = e.target.value + '%';
        this.updateEvaluationPrice();
      });
    }

    // New order form
    const newOrderForm = document.getElementById('newOrderForm');
    if (newOrderForm) {
      newOrderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.createOrder();
      });
    }

    // Order filters
    const statusFilter = document.getElementById('orderStatusFilter');
    const searchInput = document.getElementById('orderSearchInput');
    
    if (statusFilter) {
      statusFilter.addEventListener('change', () => this.renderOrdersList());
    }
    
    if (searchInput) {
      searchInput.addEventListener('input', () => this.renderOrdersList());
    }

    // Client search
    const clientSearch = document.getElementById('clientSearchInput');
    if (clientSearch) {
      clientSearch.addEventListener('input', () => this.renderClientsList());
    }

    // Settings form
    const settingsForm = document.getElementById('companySettingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSettings();
      });
    }

    // Add part form
    const addPartForm = document.getElementById('addPartForm');
    if (addPartForm) {
      addPartForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addPart();
      });
    }

    // Add quote item form
    const addQuoteItemForm = document.getElementById('addQuoteItemForm');
    if (addQuoteItemForm) {
      addQuoteItemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addQuoteItem();
      });
    }
  },

  showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
      page.style.display = 'none';
    });

    const page = document.getElementById(`${pageName}-page`);
    if (page) {
      page.style.display = 'block';
    }

    // Render page content
    switch(pageName) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'orders':
        this.renderOrdersList();
        break;
      case 'new-order':
        this.resetOrderForm();
        break;
      case 'clients':
        this.renderClientsList();
        break;
      case 'parts':
        this.renderPartsPage();
        break;
      case 'iphone-price-list':
        this.renderIphonePriceList();
        break;
      case 'settings':
        this.renderSettings();
        break;
      case 'refurbished':
        this.renderRefurbishedDevices();
        break;
      case 'evaluations':
        this.renderEvaluationsList();
        break;
      case 'new-evaluation':
        // Handled by startNewEvaluation
        break;
      case 'invoicing':
        this.renderInvoicingPage();
        break;
      case 'new-invoice':
        this.initNewInvoiceForm();
        break;
      case 'new-receipt':
        this.initNewReceiptForm();
        break;
      case 'vat-registers':
        this.renderVATRegisters();
        break;
    }
  },

  // INVOICING METHODS
  renderInvoicingPage() {
    // Update stats
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const invoicesThisMonth = appState.invoices.filter(i => 
      new Date(i.data).getMonth() === currentMonth && new Date(i.data).getFullYear() === currentYear
    ).length;
    
    const todayStr = new Date().toDateString();
    const receiptsToday = appState.receipts.filter(r => new Date(r.data).toDateString() === todayStr).length;
    
    const totalUnpaid = appState.invoices
      .filter(i => i.statoPagamento === 'Non Pagata' || i.statoPagamento === 'Parzialmente Pagata')
      .reduce((sum, i) => sum + i.totale, 0);

    document.getElementById('invoicesThisMonth').textContent = invoicesThisMonth;
    document.getElementById('receiptsToday').textContent = receiptsToday;
    document.getElementById('totalUnpaid').textContent = `€${totalUnpaid.toFixed(2)}`;

    // Render invoices
    this.renderInvoicesList();
    // Render receipts
    this.renderReceiptsList();
  },

  renderInvoicesList() {
    const statusFilter = document.getElementById('invoiceStatusFilter')?.value || '';
    let filtered = appState.invoices;
    
    if (statusFilter) {
      filtered = filtered.filter(i => i.statoPagamento === statusFilter);
    }
    
    filtered = filtered.sort((a, b) => new Date(b.data) - new Date(a.data));

    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--color-text-secondary);">Nessuna fattura trovata</td></tr>';
      return;
    }

    const statusColors = {
      'Pagata': '#10b981',
      'Non Pagata': '#ef4444',
      'Parzialmente Pagata': '#f97316',
      'Scaduta': '#991b1b'
    };

    tbody.innerHTML = filtered.map(invoice => `
      <tr>
        <td><strong>${invoice.numero}</strong></td>
        <td>${this.formatDate(invoice.data)}</td>
        <td>${invoice.cliente.nome}</td>
        <td>€${invoice.imponibile.toFixed(2)}</td>
        <td>€${invoice.totaleIva.toFixed(2)}</td>
        <td><strong>€${invoice.totale.toFixed(2)}</strong></td>
        <td>
          <span class="status-badge" style="background: ${statusColors[invoice.statoPagamento]}20; color: ${statusColors[invoice.statoPagamento]}; border: 1px solid ${statusColors[invoice.statoPagamento]}40;">
            ${invoice.statoPagamento}
          </span>
        </td>
        <td>
          <button class="btn btn--secondary action-btn" onclick="app.viewInvoice(${invoice.id})">
            Visualizza
          </button>
        </td>
      </tr>
    `).join('');
  },

  renderReceiptsList() {
    const receipts = appState.receipts.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 10);

    const tbody = document.getElementById('receiptsTableBody');
    if (!tbody) return;

    if (receipts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--color-text-secondary);">Nessuno scontrino trovato</td></tr>';
      return;
    }

    tbody.innerHTML = receipts.map(receipt => `
      <tr>
        <td><strong>${receipt.numero}</strong></td>
        <td>${this.formatDateTime(receipt.data)}</td>
        <td><strong>€${receipt.totale.toFixed(2)}</strong></td>
        <td>${receipt.metodoPagamento}</td>
        <td>
          <button class="btn btn--secondary action-btn" onclick="app.printReceipt(${receipt.id})">
            Ristampa
          </button>
        </td>
      </tr>
    `).join('');
  },

  initNewInvoiceForm() {
    const form = document.getElementById('newInvoiceForm');
    if (!form) return;
    
    form.reset();
    appState.invoiceItems = [];
    
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    form.querySelector('[name="invoiceDate"]').value = today;
    
    // Calculate due date (30 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    form.querySelector('[name="dueDate"]').value = dueDate.toISOString().split('T')[0];
    
    // Populate client dropdown
    const clientSelect = document.getElementById('invoiceClientSelect');
    clientSelect.innerHTML = '<option value="">Seleziona cliente...</option>' +
      '<option value="new">+ Nuovo Cliente</option>' +
      appState.clients.map(c => `<option value="${c.phone}">${c.name} ${c.surname}</option>`).join('');
    
    // Client select change handler
    clientSelect.addEventListener('change', (e) => {
      const newClientFields = document.getElementById('newClientFields');
      if (e.target.value === 'new') {
        newClientFields.style.display = 'block';
      } else {
        newClientFields.style.display = 'none';
      }
    });
    
    // Add one empty row
    this.addInvoiceItem();
    
    // Form submit handler
    form.onsubmit = (e) => {
      e.preventDefault();
      this.createInvoice();
    };
  },

  addInvoiceItem() {
    const container = document.getElementById('invoiceItemsContainer');
    const index = appState.invoiceItems.length;
    
    const itemHtml = `
      <div class="form-grid" style="border: 1px solid var(--color-border); border-radius: var(--radius-base); padding: 16px; margin-bottom: 12px;" data-item-index="${index}">
        <div class="form-group full-width">
          <label class="form-label">Descrizione</label>
          <textarea class="form-control" rows="2" data-field="descrizione" onchange="app.updateInvoiceTotals()"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Quantità</label>
          <input type="number" class="form-control" value="1" min="1" data-field="quantita" onchange="app.updateInvoiceTotals()">
        </div>
        <div class="form-group">
          <label class="form-label">Prezzo Unitario (€)</label>
          <input type="number" class="form-control" value="0" min="0" step="0.01" data-field="prezzoUnitario" onchange="app.updateInvoiceTotals()">
        </div>
        <div class="form-group">
          <label class="form-label">IVA %</label>
          <select class="form-control" data-field="iva" onchange="app.updateInvoiceTotals()">
            <option value="22">22%</option>
            <option value="10">10%</option>
            <option value="4">4%</option>
            <option value="0">0% (Esente)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Sconto %</label>
          <input type="number" class="form-control" value="0" min="0" max="100" data-field="sconto" onchange="app.updateInvoiceTotals()">
        </div>
        <div class="form-group" style="display: flex; align-items: flex-end;">
          <button type="button" class="btn btn--outline" onclick="app.removeInvoiceItem(${index})" style="color: var(--color-error); width: 100%;">
            Rimuovi
          </button>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', itemHtml);
    appState.invoiceItems.push({ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 22, sconto: 0 });
  },

  removeInvoiceItem(index) {
    const container = document.getElementById('invoiceItemsContainer');
    const item = container.querySelector(`[data-item-index="${index}"]`);
    if (item) {
      item.remove();
      appState.invoiceItems.splice(index, 1);
      this.updateInvoiceTotals();
    }
  },

  updateInvoiceTotals() {
    const container = document.getElementById('invoiceItemsContainer');
    const items = container.querySelectorAll('[data-item-index]');
    
    let imponibile = 0;
    let totaleIva = 0;
    
    items.forEach((item, index) => {
      const quantita = parseFloat(item.querySelector('[data-field="quantita"]').value) || 0;
      const prezzoUnitario = parseFloat(item.querySelector('[data-field="prezzoUnitario"]').value) || 0;
      const iva = parseFloat(item.querySelector('[data-field="iva"]').value) || 0;
      const sconto = parseFloat(item.querySelector('[data-field="sconto"]').value) || 0;
      
      const totaleRiga = quantita * prezzoUnitario * (1 - sconto / 100);
      const ivaRiga = totaleRiga * (iva / 100);
      
      imponibile += totaleRiga;
      totaleIva += ivaRiga;
    });
    
    const totale = imponibile + totaleIva;
    
    document.getElementById('invoiceSubtotal').textContent = `€${imponibile.toFixed(2)}`;
    document.getElementById('invoiceVAT').textContent = `€${totaleIva.toFixed(2)}`;
    document.getElementById('invoiceTotal').textContent = `€${totale.toFixed(2)}`;
  },

  createInvoice() {
    const form = document.getElementById('newInvoiceForm');
    const formData = new FormData(form);
    
    // Collect items
    const container = document.getElementById('invoiceItemsContainer');
    const itemElements = container.querySelectorAll('[data-item-index]');
    const righe = [];
    
    itemElements.forEach(item => {
      righe.push({
        descrizione: item.querySelector('[data-field="descrizione"]').value,
        quantita: parseFloat(item.querySelector('[data-field="quantita"]').value),
        prezzoUnitario: parseFloat(item.querySelector('[data-field="prezzoUnitario"]').value),
        iva: parseFloat(item.querySelector('[data-field="iva"]').value),
        sconto: parseFloat(item.querySelector('[data-field="sconto"]').value)
      });
    });
    
    // Calculate totals
    let imponibile = 0;
    let totaleIva = 0;
    righe.forEach(riga => {
      const totaleRiga = riga.quantita * riga.prezzoUnitario * (1 - riga.sconto / 100);
      const ivaRiga = totaleRiga * (riga.iva / 100);
      imponibile += totaleRiga;
      totaleIva += ivaRiga;
    });
    
    const today = new Date();
    const year = today.getFullYear();
    const invoiceNumber = `FT-${year}-${String(appState.invoiceCounter).padStart(4, '0')}`;
    
    // Create cliente object
    let cliente;
    if (formData.get('invoiceClient') === 'new') {
      cliente = {
        nome: formData.get('clientName'),
        indirizzo: formData.get('clientAddress'),
        cap: formData.get('clientCAP'),
        citta: formData.get('clientCity'),
        provincia: formData.get('clientProvince'),
        codiceFiscale: formData.get('clientCF') || '',
        partitaIva: formData.get('clientPIVA') || '',
        codiceSdi: formData.get('clientSDI') || ''
      };
    } else {
      const phone = formData.get('invoiceClient');
      const existingClient = appState.clients.find(c => c.phone === phone);
      cliente = {
        nome: `${existingClient.name} ${existingClient.surname}`,
        indirizzo: '',
        cap: '',
        citta: '',
        provincia: '',
        codiceFiscale: '',
        partitaIva: '',
        codiceSdi: ''
      };
    }
    
    const invoice = {
      id: appState.invoices.length + 1,
      numero: invoiceNumber,
      data: new Date(formData.get('invoiceDate')),
      tipo: formData.get('invoiceType'),
      cliente: cliente,
      righe: righe,
      imponibile: imponibile,
      totaleIva: totaleIva,
      totale: imponibile + totaleIva,
      metodoPagamento: formData.get('paymentMethod'),
      statoPagamento: formData.get('paymentStatus'),
      scadenza: formData.get('dueDate') ? new Date(formData.get('dueDate')) : null,
      note: formData.get('invoiceNotes') || ''
    };
    
    if (invoice.statoPagamento === 'Pagata') {
      invoice.dataPagamento = new Date();
    }
    
    appState.invoices.push(invoice);
    appState.invoiceCounter++;
    
    this.showToast(`Fattura ${invoiceNumber} creata con successo!`, 'success');
    this.showPage('invoicing');
  },

  viewInvoice(invoiceId) {
    const invoice = appState.invoices.find(i => i.id === invoiceId);
    if (!invoice) return;
    
    this.printInvoice(invoice);
  },

  printInvoice(invoice) {
    const template = `
      <div class="invoice-template">
        <!-- HEADER -->
        <div class="invoice-header">
          <div>
            <div class="invoice-company-name">Fixit Repair Express</div>
            <div class="invoice-company">
              Fixit Repair Express SRL<br>
              Via Roma 123<br>
              20100 Milano (MI)<br>
              Tel: 02-1234567 | Cell: 339-1234567<br>
              Email: info@techrepair.it<br>
              PEC: techrepairlab@pec.it<br>
              <strong>P.IVA:</strong> IT12345678901<br>
              <strong>C.F.:</strong> 12345678901<br>
              REA: MI-1234567 | Cap. Soc.: €10.000
            </div>
          </div>
          <div class="invoice-number-box">
            <h2>${invoice.tipo.toUpperCase()} N.</h2>
            <p style="font-size: 14pt; font-weight: bold; color: #1a7482;">${invoice.numero}</p>
            <p style="margin-top: 12px;"><strong>Data Emissione:</strong><br>${this.formatDate(invoice.data)}</p>
            ${invoice.scadenza ? `<p><strong>Scadenza:</strong><br>${this.formatDate(invoice.scadenza)}</p>` : ''}
            <p><strong>Pagamento:</strong><br>${invoice.metodoPagamento}</p>
          </div>
        </div>
        
        <!-- CLIENT BOX -->
        <div class="invoice-client-box">
          <div class="invoice-client-title">Intestatario Fattura</div>
          <strong style="font-size: 11pt;">${invoice.cliente.nome}</strong><br>
          ${invoice.cliente.indirizzo ? invoice.cliente.indirizzo + '<br>' : ''}
          ${invoice.cliente.cap || ''} ${invoice.cliente.citta || ''} ${invoice.cliente.provincia ? '(' + invoice.cliente.provincia + ')' : ''}<br>
          ${invoice.cliente.codiceFiscale ? '<strong>C.F.:</strong> ' + invoice.cliente.codiceFiscale + '<br>' : ''}
          ${invoice.cliente.partitaIva ? '<strong>P.IVA:</strong> ' + invoice.cliente.partitaIva + '<br>' : ''}
          ${invoice.cliente.codiceSdi ? '<strong>Codice SDI / PEC:</strong> ' + invoice.cliente.codiceSdi : ''}
        </div>
        
        <!-- INVOICE TABLE -->
        <table class="invoice-table">
          <thead>
            <tr>
              <th style="width: 40%;">DESCRIZIONE</th>
              <th class="text-center" style="width: 8%;">Q.TÀ</th>
              <th class="text-right" style="width: 12%;">PREZZO UNIT.</th>
              <th class="text-center" style="width: 10%;">SCONTO</th>
              <th class="text-center" style="width: 8%;">IVA%</th>
              <th class="text-right" style="width: 12%;">TOTALE</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.righe.map(riga => {
              const totaleRiga = riga.quantita * riga.prezzoUnitario * (1 - riga.sconto / 100);
              return `
                <tr>
                  <td>${riga.descrizione}</td>
                  <td class="text-center">${riga.quantita}</td>
                  <td class="text-right">€${riga.prezzoUnitario.toFixed(2)}</td>
                  <td class="text-center">${riga.sconto}%</td>
                  <td class="text-center">${riga.iva}%</td>
                  <td class="text-right">€${totaleRiga.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <!-- TOTALS BOX -->
        <div class="invoice-totals-box">
          <div class="invoice-total-row">
            <span>Imponibile:</span>
            <span>€${invoice.imponibile.toFixed(2)}</span>
          </div>
          <div class="invoice-total-row">
            <span>IVA 22%:</span>
            <span>€${invoice.totaleIva.toFixed(2)}</span>
          </div>
          <div class="invoice-total-row">
            <span>TOTALE FATTURA:</span>
            <span>€${invoice.totale.toFixed(2)}</span>
          </div>
        </div>
        
        <!-- PAYMENT INFO -->
        <div class="invoice-payment-box">
          <div class="invoice-payment-title">Condizioni di Pagamento</div>
          <p style="margin: 4px 0;"><strong>Metodo:</strong> ${invoice.metodoPagamento}</p>
          ${invoice.metodoPagamento.includes('Bonifico') ? `
            <p style="margin: 4px 0;"><strong>IBAN:</strong> IT60X0542811101000000123456</p>
            <p style="margin: 4px 0;"><strong>Banca:</strong> Banca Intesa Sanpaolo</p>
          ` : ''}
          ${invoice.scadenza ? `<p style="margin: 4px 0;"><strong>Termini:</strong> 30 giorni data fattura</p>` : ''}
        </div>
        
        <!-- UNPAID WARNING -->
        ${invoice.statoPagamento !== 'Pagata' && invoice.scadenza ? `
          <div class="invoice-unpaid-warning">
            ⚠️ IMPORTO DA SALDARE: €${invoice.totale.toFixed(2)} entro il ${this.formatDate(invoice.scadenza)}
          </div>
        ` : ''}
        
        ${invoice.note ? `
          <div style="margin: 20px 0; padding: 12px; background: #f9f9f9; border-left: 4px solid #1a7482;">
            <strong>Note:</strong><br>
            ${invoice.note}
          </div>
        ` : ''}
        
        <!-- FOOTER -->
        <div class="invoice-footer">
          Operazione effettuata ai sensi dell'art. 1 comma 1 del DPR 633/72.<br>
          Pagamento non soggetto a ritenuta d'acconto.<br>
          In caso di ritardo nei pagamenti verranno applicati interessi di mora ai sensi del D.Lgs. 231/2002.<br>
          <br>
          <strong>Condizioni di vendita:</strong> Merce viaggia a rischio e pericolo del committente anche se venduta franco destino.
          I prodotti ricondizionati sono garantiti 12 mesi per difetti di conformità.
          La garanzia non copre danni da liquidi, cadute o uso improprio.
        </div>
      </div>
    `;
    
    this.showPrintPreview(template);
  },

  initNewReceiptForm() {
    const form = document.getElementById('newReceiptForm');
    if (!form) return;
    
    form.reset();
    appState.receiptItems = [];
    
    // Add one empty row
    this.addReceiptItem();
    
    // Form submit handler
    form.onsubmit = (e) => {
      e.preventDefault();
      this.createReceipt();
    };
  },

  addReceiptItem() {
    const container = document.getElementById('receiptItemsContainer');
    const index = appState.receiptItems.length;
    
    const itemHtml = `
      <div class="form-grid" style="border: 1px solid var(--color-border); border-radius: var(--radius-base); padding: 16px; margin-bottom: 12px;" data-receipt-item="${index}">
        <div class="form-group">
          <label class="form-label">Descrizione</label>
          <input type="text" class="form-control" data-field="descrizione" onchange="app.updateReceiptTotal()">
        </div>
        <div class="form-group">
          <label class="form-label">Quantità</label>
          <input type="number" class="form-control" value="1" min="1" data-field="quantita" onchange="app.updateReceiptTotal()">
        </div>
        <div class="form-group">
          <label class="form-label">Prezzo Totale (€)</label>
          <input type="number" class="form-control" value="0" min="0" step="0.01" data-field="prezzoTotale" onchange="app.updateReceiptTotal()">
        </div>
        <div class="form-group" style="display: flex; align-items: flex-end;">
          <button type="button" class="btn btn--outline" onclick="app.removeReceiptItem(${index})" style="color: var(--color-error); width: 100%;">
            Rimuovi
          </button>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', itemHtml);
    appState.receiptItems.push({ descrizione: '', quantita: 1, prezzoTotale: 0 });
  },

  removeReceiptItem(index) {
    const container = document.getElementById('receiptItemsContainer');
    const item = container.querySelector(`[data-receipt-item="${index}"]`);
    if (item) {
      item.remove();
      appState.receiptItems.splice(index, 1);
      this.updateReceiptTotal();
    }
  },

  updateReceiptTotal() {
    const container = document.getElementById('receiptItemsContainer');
    const items = container.querySelectorAll('[data-receipt-item]');
    
    let totale = 0;
    items.forEach(item => {
      const prezzoTotale = parseFloat(item.querySelector('[data-field="prezzoTotale"]').value) || 0;
      totale += prezzoTotale;
    });
    
    document.getElementById('receiptTotal').textContent = `€${totale.toFixed(2)}`;
  },

  createReceipt() {
    const form = document.getElementById('newReceiptForm');
    const formData = new FormData(form);
    
    // Collect items
    const container = document.getElementById('receiptItemsContainer');
    const itemElements = container.querySelectorAll('[data-receipt-item]');
    const righe = [];
    
    itemElements.forEach(item => {
      righe.push({
        descrizione: item.querySelector('[data-field="descrizione"]').value,
        quantita: parseFloat(item.querySelector('[data-field="quantita"]').value),
        prezzoTotale: parseFloat(item.querySelector('[data-field="prezzoTotale"]').value)
      });
    });
    
    const totale = righe.reduce((sum, riga) => sum + riga.prezzoTotale, 0);
    
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const receiptNumber = `SC-${dateStr}-${String(appState.receiptCounter).padStart(3, '0')}`;
    
    const receipt = {
      id: appState.receipts.length + 1,
      numero: receiptNumber,
      data: today,
      cliente: formData.get('receiptClient') || '',
      righe: righe,
      totale: totale,
      metodoPagamento: formData.get('receiptPaymentMethod')
    };
    
    appState.receipts.push(receipt);
    appState.receiptCounter++;
    
    this.showToast(`Scontrino ${receiptNumber} emesso!`, 'success');
    this.printReceipt(receipt.id);
    this.showPage('invoicing');
  },

  printReceipt(receiptId) {
    const receipt = appState.receipts.find(r => r.id === receiptId);
    if (!receipt) return;
    
    const ivaIncluded = receipt.totale / 1.22 * 0.22;
    
    const template = `
      <div class="receipt-template">
        <!-- HEADER -->
        <div class="receipt-header">
          <div class="receipt-logo">Fixit Repair Express</div>
          <div class="receipt-company">
            Fixit Repair Express SRL<br>
            Via Roma 123, 20100 Milano<br>
            Tel: 02-1234567<br>
            Email: info@techrepair.it<br>
            P.IVA: IT12345678901
          </div>
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-title">SCONTRINO FISCALE N.</div>
        <div class="receipt-info">
          <strong>${receipt.numero}</strong><br>
          ${this.formatDateTime(receipt.data)}
        </div>
        
        <div class="receipt-divider"></div>
        
        <div style="text-align: center; margin: 8px 0; font-weight: bold;">DESCRIZIONE</div>
        
        ${receipt.righe.map(riga => `
          <div class="receipt-item">
            <div class="receipt-item-name">${riga.descrizione}</div>
            <div class="receipt-item-details">
              <span>Q.tà ${riga.quantita}</span>
              <span style="font-weight: bold;">€${riga.prezzoTotale.toFixed(2)}</span>
            </div>
          </div>
        `).join('')}
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-totals">
          <div class="receipt-total-row">
            <span>SUBTOTALE</span>
            <span>€${receipt.totale.toFixed(2)}</span>
          </div>
          <div class="receipt-total-row">
            <span>IVA 22% inclusa</span>
            <span>€${ivaIncluded.toFixed(2)}</span>
          </div>
        </div>
        
        <div class="receipt-grand-total">
          <div style="display: flex; justify-content: space-between;">
            <span>TOTALE EURO</span>
            <span>€${receipt.totale.toFixed(2)}</span>
          </div>
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-payment">
          Metodo: <strong>${receipt.metodoPagamento.toUpperCase()}</strong>
        </div>
        
        ${receipt.cliente ? `
          <div style="text-align: center; margin: 8px 0; font-size: 9pt;">
            Cliente: ${receipt.cliente}
          </div>
        ` : ''}
        
        <div class="receipt-divider"></div>
        
        <div style="text-align: center; margin: 12px 0; font-weight: bold;">
          GRAZIE PER LA FIDUCIA<br>
          A PRESTO!
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-footer">
          Documento commerciale<br>
          non valido ai fini fiscali<br>
          (D.L. 127/2015)<br>
          <br>
          ${this.formatDateTime(new Date())}
        </div>
        
        <div class="receipt-divider"></div>
      </div>
    `;
    
    this.showPrintPreview(template);
  },

  importFromOrder() {
    const orders = appState.orders.filter(o => o.status === 'Completato' && o.quote && o.quote.items);
    
    if (orders.length === 0) {
      this.showToast('Nessun ordine completato disponibile', 'error');
      return;
    }
    
    const orderNumber = prompt('Inserisci numero ordine (es: ' + orders[0].number + '):');
    if (!orderNumber) return;
    
    const order = orders.find(o => o.number === orderNumber);
    if (!order) {
      this.showToast('Ordine non trovato', 'error');
      return;
    }
    
    // Clear existing items
    appState.invoiceItems = [];
    document.getElementById('invoiceItemsContainer').innerHTML = '';
    
    // Add order items
    order.quote.items.forEach(item => {
      this.addInvoiceItem();
      const container = document.getElementById('invoiceItemsContainer');
      const lastItem = container.lastElementChild;
      lastItem.querySelector('[data-field="descrizione"]').value = item.partName;
      lastItem.querySelector('[data-field="quantita"]').value = item.quantity;
      lastItem.querySelector('[data-field="prezzoUnitario"]').value = item.price;
    });
    
    // Add labor
    if (order.quote.labor > 0) {
      this.addInvoiceItem();
      const container = document.getElementById('invoiceItemsContainer');
      const lastItem = container.lastElementChild;
      lastItem.querySelector('[data-field="descrizione"]').value = `Manodopera tecnica (${order.quote.labor}h)`;
      lastItem.querySelector('[data-field="quantita"]').value = 1;
      lastItem.querySelector('[data-field="prezzoUnitario"]').value = order.quote.labor * appState.settings.laborCost;
    }
    
    this.updateInvoiceTotals();
    this.showToast('Dati importati da ordine ' + orderNumber, 'success');
  },

  renderVATRegisters() {
    const period = document.getElementById('vatPeriodFilter')?.value || 'month';
    const today = new Date();
    let startDate, endDate;
    
    if (period === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (period === 'quarter') {
      const quarter = Math.floor(today.getMonth() / 3);
      startDate = new Date(today.getFullYear(), quarter * 3, 1);
      endDate = new Date(today.getFullYear(), quarter * 3 + 3, 0);
    } else {
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31);
    }
    
    const invoicesInPeriod = appState.invoices.filter(i => {
      const invoiceDate = new Date(i.data);
      return invoiceDate >= startDate && invoiceDate <= endDate;
    });
    
    const receiptsInPeriod = appState.receipts.filter(r => {
      const receiptDate = new Date(r.data);
      return receiptDate >= startDate && receiptDate <= endDate;
    });
    
    let totalImponibile = 0;
    let totalIva = 0;
    
    invoicesInPeriod.forEach(i => {
      totalImponibile += i.imponibile;
      totalIva += i.totaleIva;
    });
    
    // For receipts, estimate VAT (assuming 22% included)
    receiptsInPeriod.forEach(r => {
      const imponibile = r.totale / 1.22;
      const iva = r.totale - imponibile;
      totalImponibile += imponibile;
      totalIva += iva;
    });
    
    const content = document.getElementById('vatRegisterContent');
    if (!content) return;
    
    content.innerHTML = `
      <div style="margin-top: 20px;">
        <table class="orders-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Numero</th>
              <th>Cliente</th>
              <th>Imponibile</th>
              <th>IVA</th>
              <th>Totale</th>
            </tr>
          </thead>
          <tbody>
            ${invoicesInPeriod.map(i => `
              <tr>
                <td>${this.formatDate(i.data)}</td>
                <td>Fattura</td>
                <td>${i.numero}</td>
                <td>${i.cliente.nome}</td>
                <td>€${i.imponibile.toFixed(2)}</td>
                <td>€${i.totaleIva.toFixed(2)}</td>
                <td>€${i.totale.toFixed(2)}</td>
              </tr>
            `).join('')}
            ${receiptsInPeriod.map(r => {
              const imponibile = r.totale / 1.22;
              const iva = r.totale - imponibile;
              return `
                <tr>
                  <td>${this.formatDate(r.data)}</td>
                  <td>Scontrino</td>
                  <td>${r.numero}</td>
                  <td>${r.cliente || '-'}</td>
                  <td>€${imponibile.toFixed(2)}</td>
                  <td>€${iva.toFixed(2)}</td>
                  <td>€${r.totale.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div style="margin-top: 30px; padding: 20px; background: var(--color-bg-2); border-radius: var(--radius-lg);">
          <h3>Riepilogo Periodo</h3>
          <div class="calculation-row">
            <span>Totale Imponibile:</span>
            <span><strong>€${totalImponibile.toFixed(2)}</strong></span>
          </div>
          <div class="calculation-row">
            <span>Totale IVA:</span>
            <span><strong>€${totalIva.toFixed(2)}</strong></span>
          </div>
          <div class="calculation-row" style="font-size: 18px; margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--color-border);">
            <span>Totale Vendite:</span>
            <span><strong>€${(totalImponibile + totalIva).toFixed(2)}</strong></span>
          </div>
        </div>
        
        <div style="margin-top: 20px;">
          <button class="btn btn--primary" onclick="alert('Funzione esportazione CSV in sviluppo')">
            📊 Esporta CSV
          </button>
        </div>
      </div>
    `;
  },

  renderDashboard() {
    // Update statistics
    const totalOrders = appState.orders.length;
    const inProgress = appState.orders.filter(o => o.status === 'In Lavorazione').length;
    const today = new Date().toDateString();
    const completedToday = appState.orders.filter(o => 
      o.status === 'Completato' && new Date(o.createdAt).toDateString() === today
    ).length;
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyRevenue = appState.invoices
      .filter(i => new Date(i.data).getMonth() === currentMonth && new Date(i.data).getFullYear() === currentYear)
      .reduce((sum, i) => sum + i.totale, 0);
    
    const todayStr = new Date().toDateString();
    const todayRevenue = appState.receipts
      .filter(r => new Date(r.data).toDateString() === todayStr)
      .reduce((sum, r) => sum + r.totale, 0);
    
    const unpaidInvoices = appState.invoices.filter(i => i.statoPagamento === 'Non Pagata' || i.statoPagamento === 'Parzialmente Pagata').length;

    document.getElementById('statTotalOrders').textContent = totalOrders;
    document.getElementById('statInProgress').textContent = inProgress;
    document.getElementById('statCompletedToday').textContent = completedToday;
    document.getElementById('statMonthlyRevenue').textContent = `€${monthlyRevenue.toFixed(2)}`;
    document.getElementById('statTodayRevenue').textContent = `€${todayRevenue.toFixed(2)}`;
    document.getElementById('statUnpaidInvoices').textContent = unpaidInvoices;
    
    // New statistics for refurbished and evaluations
    const refurbishedAvailable = appState.refurbishedDevices.filter(d => d.stato === 'Disponibile').length;
    const inventoryValue = appState.refurbishedDevices
      .filter(d => d.stato === 'Disponibile')
      .reduce((sum, d) => sum + d.prezzo, 0);
    const pendingEvaluations = appState.evaluations.filter(e => e.stato === 'In Attesa').length;
    const thisMonth = new Date().getMonth();
    const devicesPurchased = appState.evaluations.filter(e => 
      e.stato === 'Completata' && new Date(e.data).getMonth() === thisMonth
    ).length;
    
    document.getElementById('statRefurbishedAvailable').textContent = refurbishedAvailable;
    document.getElementById('statInventoryValue').textContent = `€${inventoryValue.toFixed(0)}`;
    document.getElementById('statPendingEvaluations').textContent = pendingEvaluations;
    document.getElementById('statDevicesPurchased').textContent = devicesPurchased;

    // Render recent orders
    const recentOrders = appState.orders
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    const recentOrdersList = document.getElementById('recentOrdersList');
    if (recentOrdersList) {
      recentOrdersList.innerHTML = recentOrders.map(order => `
        <div class="order-item" onclick="app.showOrderDetail(${order.id})">
          <div class="order-info">
            <div class="order-number">${order.number}</div>
            <div class="order-customer">${order.customer.name} ${order.customer.surname} - ${order.device.type} ${order.device.model}</div>
          </div>
          <span class="status-badge" style="background: ${statusColors[order.status]}20; color: ${statusColors[order.status]}; border: 1px solid ${statusColors[order.status]}40;">
            ${order.status}
          </span>
        </div>
      `).join('');
    }
  },

  // Render pagina Listino Riparazioni iPhone
  renderIphonePriceList() {
    const tbody = document.getElementById('iphonePriceTableBody');
    const cardsContainer = document.getElementById('iphonePriceCards');
    const modelFilterSelect = document.getElementById('iphoneModelFilter');
    const repairFilterSelect = document.getElementById('iphoneRepairFilter');
    if (!tbody || !cardsContainer) return;

    const list = appState.repairPriceList || [];

    // Popola i filtri solo la prima volta
    if (modelFilterSelect && modelFilterSelect.options.length <= 1) {
      const models = Array.from(new Set(list.map(item => item.model))).sort();
      models.forEach(m => {
        if (!m) return;
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelFilterSelect.appendChild(opt);
      });

      const repairs = Array.from(new Set(list.map(item => item.repairType))).sort();
      repairs.forEach(r => {
        if (!r) return;
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        repairFilterSelect.appendChild(opt);
      });

      if (modelFilterSelect) {
        modelFilterSelect.addEventListener('change', () => this.renderIphonePriceList());
      }
      if (repairFilterSelect) {
        repairFilterSelect.addEventListener('change', () => this.renderIphonePriceList());
      }
    }

    const selectedModel = modelFilterSelect ? modelFilterSelect.value : '';
    const selectedRepair = repairFilterSelect ? repairFilterSelect.value : '';

    // Se nessun modello è selezionato, non mostrare tutto il listino
    if (!selectedModel) {
      cardsContainer.innerHTML = '<p style="color: var(--color-text-secondary);">Seleziona un modello per vedere il riepilogo rapido delle riparazioni.</p>';
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; color: var(--color-text-secondary); padding: 32px 8px;">
            Seleziona un modello di iPhone per vedere le riparazioni disponibili.
          </td>
        </tr>`;
      return;
    }

    let filtered = list.filter(item => item.model === selectedModel);
    if (selectedRepair) {
      filtered = filtered.filter(item => item.repairType === selectedRepair);
    }

    if (filtered.length === 0) {
      cardsContainer.innerHTML = '<p style="color: var(--color-text-secondary);">Nessuna riparazione trovata per questo modello con i filtri selezionati.</p>';
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; color: var(--color-text-secondary); padding: 32px 8px;">
            Nessuna riparazione trovata per questo modello con i filtri selezionati.
          </td>
        </tr>`;
      return;
    }

    // --- CARD COMPATTE ---
    const byRepairType = new Map();
    filtered.forEach(item => {
      if (!byRepairType.has(item.repairType)) {
        byRepairType.set(item.repairType, []);
      }
      byRepairType.get(item.repairType).push(item);
    });

    const cardsHtml = Array.from(byRepairType.entries()).map(([repairType, items]) => {
      // scegli un prezzo "principale" (il più basso fra prezzo/promo)
      const prices = items
        .map(i => (i.promoPrice != null ? i.promoPrice : i.price))
        .filter(v => v != null);
      const minPrice = prices.length > 0 ? Math.min(...prices) : null;

      const hasPromo = items.some(i => i.promoPrice != null);

      return `
        <div class="iphone-price-card">
          <div class="iphone-price-card-header">
            <span class="iphone-price-name">${repairType}</span>
            ${minPrice != null ? `<span class="iphone-price-main">da €${minPrice.toFixed(2)}</span>` : ''}
          </div>
          <div class="iphone-price-card-meta">
            <span class="iphone-price-chip">${items.length} varianti</span>
            ${hasPromo ? '<span class="iphone-price-chip iphone-price-chip--promo">Promo disponibili</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    cardsContainer.innerHTML = cardsHtml;

    // --- TABELLA DETTAGLIATA ---
    tbody.innerHTML = filtered.map(item => `
      <tr>
        <td>${item.model}</td>
        <td>${item.repairType}</td>
        <td>${item.price != null ? `€${item.price.toFixed(2)}` : '-'}</td>
        <td>${item.promoPrice != null ? `€${item.promoPrice.toFixed(2)}` : '-'}</td>
        <td>${item.secondWorkPrice != null ? `€${item.secondWorkPrice.toFixed(2)}` : '-'}</td>
      </tr>
    `).join('');
  },

  renderOrdersList() {
    const statusFilter = document.getElementById('orderStatusFilter')?.value || '';
    const searchQuery = document.getElementById('orderSearchInput')?.value.toLowerCase() || '';

    const clientPhoneFilter = appState.orderClientFilterPhone || '';

    let filteredOrders = appState.orders;

    if (statusFilter) {
      filteredOrders = filteredOrders.filter(o => o.status === statusFilter);
    }

    if (searchQuery) {
      filteredOrders = filteredOrders.filter(o => 
        o.number.toLowerCase().includes(searchQuery) ||
        `${o.customer.name} ${o.customer.surname}`.toLowerCase().includes(searchQuery)
      );
    }

    if (clientPhoneFilter) {
      filteredOrders = filteredOrders.filter(o => o.customer.phone === clientPhoneFilter);
      // reset filter after applying once so future visits show all
      appState.orderClientFilterPhone = null;
    }

    const tbody = document.getElementById('ordersTableBody');
    if (tbody) {
      tbody.innerHTML = filteredOrders.map(order => `
        <tr>
          <td><strong>${order.number}</strong></td>
          <td>${order.customer.name} ${order.customer.surname}</td>
          <td>${order.device.type} ${order.device.model}</td>
          <td>
            <span class="status-badge" style="background: ${statusColors[order.status]}20; color: ${statusColors[order.status]}; border: 1px solid ${statusColors[order.status]}40;" onclick="app.openQuickStatusModal(${order.id})">
              ${order.status}
            </span>
          </td>
          <td>${this.formatDate(order.createdAt)}</td>
          <td>
            <button class="btn btn--secondary action-btn" onclick="app.showOrderDetail(${order.id})">
              Dettagli
            </button>
          </td>
        </tr>
      `).join('');
    }
  },

  openQuickStatusModal(orderId) {
    const order = appState.orders.find(o => o.id === orderId);
    if (!order) return;

    appState.currentOrder = order;

    const modal = document.getElementById('quickStatusModal');
    const select = document.getElementById('quickStatusSelect');
    if (!modal || !select) return;

    select.value = order.status;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  closeQuickStatusModal() {
    const modal = document.getElementById('quickStatusModal');
    if (modal) {
      modal.classList.remove('show');
    }
    document.body.style.overflow = '';
  },

  applyQuickStatusChange() {
    if (!appState.currentOrder) {
      this.closeQuickStatusModal();
      return;
    }

    const select = document.getElementById('quickStatusSelect');
    if (!select) {
      this.closeQuickStatusModal();
      return;
    }

    const newStatus = select.value;
    const order = appState.currentOrder;

    if (newStatus && newStatus !== order.status) {
      order.status = newStatus;
      order.timeline = order.timeline || [];
      order.timeline.push({ status: newStatus, date: new Date() });

      try {
        localStorage.setItem('nowfixit_orders', JSON.stringify(appState.orders));
      } catch (e) {
        console.warn('Impossibile salvare gli ordini in localStorage:', e);
      }

      this.showToast('Stato riparazione aggiornato', 'success');
    }

    this.closeQuickStatusModal();
    this.renderOrdersList();
  },

  resetOrderForm() {
    const form = document.getElementById('newOrderForm');
    if (form) {
      form.reset();
      appState.currentStep = 1;
      this.updateFormSteps();
    }
  },

  updateFormSteps() {
    document.querySelectorAll('.step').forEach((step, index) => {
      const stepNum = index + 1;
      step.classList.remove('active', 'completed');
      if (stepNum === appState.currentStep) {
        step.classList.add('active');
      } else if (stepNum < appState.currentStep) {
        step.classList.add('completed');
      }
    });

    document.querySelectorAll('.form-step').forEach((step, index) => {
      const stepNum = index + 1;
      step.classList.remove('active');
      if (stepNum === appState.currentStep) {
        step.classList.add('active');
      }
    });

    if (appState.currentStep === 4) {
      this.showOrderSummary();
    }
  },

  nextStep() {
    const currentStepElement = document.querySelector(`.form-step[data-step="${appState.currentStep}"]`);
    const inputs = currentStepElement.querySelectorAll('input[required], select[required], textarea[required]');
    
    let isValid = true;
    inputs.forEach(input => {
      if (!input.value.trim()) {
        isValid = false;
        input.style.borderColor = 'var(--color-error)';
      } else {
        input.style.borderColor = '';
      }
    });

    if (!isValid) {
      this.showToast('Compila tutti i campi obbligatori', 'error');
      return;
    }

    if (appState.currentStep < 4) {
      appState.currentStep++;
      this.updateFormSteps();
    }
  },

  prevStep() {
    if (appState.currentStep > 1) {
      appState.currentStep--;
      this.updateFormSteps();
    }
  },

  updateDeviceModels(deviceType) {
    const modelSelect = document.querySelector('select[name="deviceModel"]');
    if (!modelSelect) return;

    const models = deviceData[deviceType] || [];
    modelSelect.innerHTML = '<option value="">Seleziona...</option>' + 
      models.map(model => `<option value="${model}">${model}</option>`).join('');
  },

  showOrderSummary() {
    const form = document.getElementById('newOrderForm');
    const formData = new FormData(form);
    
    const summary = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div>
          <h4 style="margin-bottom: 12px; color: var(--color-text);">Cliente</h4>
          <div class="info-row">
            <span class="info-label">Nome</span>
            <span class="info-value">${formData.get('customerName')} ${formData.get('customerSurname')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Telefono</span>
            <span class="info-value">${formData.get('customerPhone')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Email</span>
            <span class="info-value">${formData.get('customerEmail') || '-'}</span>
          </div>
        </div>
        
        <div>
          <h4 style="margin-bottom: 12px; color: var(--color-text);">Dispositivo</h4>
          <div class="info-row">
            <span class="info-label">Tipo</span>
            <span class="info-value">${formData.get('deviceType')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Modello</span>
            <span class="info-value">${formData.get('deviceModel')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Seriale/IMEI</span>
            <span class="info-value">${formData.get('deviceSerial') || '-'}</span>
          </div>
        </div>
        
        <div>
          <h4 style="margin-bottom: 12px; color: var(--color-text);">Problema</h4>
          <div class="info-row">
            <span class="info-label">Categoria</span>
            <span class="info-value">${formData.get('problemCategory')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Priorità</span>
            <span class="info-value">${formData.get('priority')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Descrizione</span>
            <span class="info-value">${formData.get('problemDescription')}</span>
          </div>
        </div>
      </div>
    `;

    document.getElementById('orderSummary').innerHTML = summary;
  },

  createOrder() {
    const form = document.getElementById('newOrderForm');
    const formData = new FormData(form);

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const orderNumber = `WO-${dateStr}-${String(appState.orderCounter).padStart(3, '0')}`;

    const order = {
      id: appState.orderCounter,
      number: orderNumber,
      customer: {
        name: formData.get('customerName'),
        surname: formData.get('customerSurname'),
        phone: formData.get('customerPhone'),
        email: formData.get('customerEmail') || '',
        notes: formData.get('customerNotes') || ''
      },
      device: {
        type: formData.get('deviceType'),
        model: formData.get('deviceModel'),
        serial: formData.get('deviceSerial') || '',
        condition: formData.get('deviceCondition') || '',
        accessories: formData.get('accessories') || ''
      },
      problem: {
        category: formData.get('problemCategory'),
        description: formData.get('problemDescription'),
        priority: formData.get('priority')
      },
      status: 'Preventivo',
      createdAt: today,
      timeline: [
        { status: 'Preventivo', date: today }
      ],
      quote: null,
      internalNotes: ''
    };

    appState.orders.push(order);
    appState.orderCounter++;

    try {
      localStorage.setItem('nowfixit_orders', JSON.stringify(appState.orders));
    } catch (e) {
      console.warn('Impossibile salvare gli ordini in localStorage:', e);
    }

    this.updateClientsList();
    this.showToast(`Ordine ${orderNumber} creato con successo!`, 'success');
    this.showPage('orders');
  },

  showOrderDetail(orderId) {
    const order = appState.orders.find(o => o.id === orderId);
    if (!order) return;

    appState.currentOrder = order;
    this.showPage('order-detail');

    // Update title
    document.getElementById('orderDetailTitle').textContent = order.number;

    // Order info
    const orderInfo = `
      <div class="info-row">
        <span class="info-label">Nr. Ordine</span>
        <span class="info-value"><strong>${order.number}</strong></span>
      </div>
      <div class="info-row">
        <span class="info-label">Data Creazione</span>
        <span class="info-value">${this.formatDate(order.createdAt)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Stato</span>
        <span class="info-value">
          <span class="status-badge" style="background: ${statusColors[order.status]}20; color: ${statusColors[order.status]}; border: 1px solid ${statusColors[order.status]}40;">
            ${order.status}
          </span>
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">Priorità</span>
        <span class="info-value">${order.problem.priority}</span>
      </div>
      <div style="margin-top: 16px;">
        <button class="btn btn--primary" style="width: 100%;" onclick="app.showChangeStatusModal()">
          Cambia Stato
        </button>
      </div>
    `;
    document.getElementById('orderDetailInfo').innerHTML = orderInfo;

    // Timeline
    const timeline = order.timeline.map(item => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-status">${item.status}</div>
          <div class="timeline-date">${this.formatDateTime(item.date)}</div>
        </div>
      </div>
    `).join('');
    document.getElementById('orderTimeline').innerHTML = `<div class="timeline">${timeline}</div>`;

    // Customer info
    const customerInfo = `
      <div class="info-row">
        <span class="info-label">Nome</span>
        <span class="info-value">${order.customer.name} ${order.customer.surname}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Telefono</span>
        <span class="info-value">${order.customer.phone}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email</span>
        <span class="info-value">${order.customer.email || '-'}</span>
      </div>
    `;
    document.getElementById('orderCustomerInfo').innerHTML = customerInfo;

    // Device info
    const deviceInfo = `
      <div class="info-row">
        <span class="info-label">Tipo</span>
        <span class="info-value">${order.device.type}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Modello</span>
        <span class="info-value">${order.device.model}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Seriale/IMEI</span>
        <span class="info-value">${order.device.serial || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Condizioni</span>
        <span class="info-value">${order.device.condition || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Problema</span>
        <span class="info-value">${order.problem.category}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Descrizione</span>
        <span class="info-value">${order.problem.description}</span>
      </div>
    `;
    document.getElementById('orderDeviceInfo').innerHTML = deviceInfo;

    // Quote
    this.renderQuoteSection(order);

    // Internal notes
    document.getElementById('internalNotes').value = order.internalNotes || '';
  },

  renderQuoteSection(order) {
    let quoteHtml = '';

    if (!order.quote || !order.quote.items || order.quote.items.length === 0) {
      quoteHtml = `
        <p style="color: var(--color-text-secondary); margin-bottom: 16px;">Nessun preventivo creato</p>
        <button class="btn btn--primary" onclick="app.showAddQuoteItemModal()">
          ➕ Aggiungi Ricambio
        </button>
      `;
    } else {
      const itemsTable = `
        <table class="quote-table">
          <thead>
            <tr>
              <th>Ricambio</th>
              <th>Quantità</th>
              <th>Prezzo</th>
              <th>Totale</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            ${order.quote.items.map((item, index) => `
              <tr>
                <td>${item.partName}</td>
                <td>${item.quantity}</td>
                <td>€${item.price.toFixed(2)}</td>
                <td>€${(item.price * item.quantity).toFixed(2)}</td>
                <td>
                  <button class="btn btn--outline action-btn" onclick="app.removeQuoteItem(${index})" style="color: var(--color-error);">
                    Rimuovi
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div style="margin-top: 16px;">
          <label class="form-label">Ore Manodopera</label>
          <input type="number" id="laborHours" class="form-control" value="${order.quote.labor || 0}" min="0" step="0.5" onchange="app.updateQuoteTotals()" style="max-width: 200px;">
        </div>
        
        <div class="quote-totals">
          <div class="total-row">
            <span>Ricambi:</span>
            <span id="partsTotal">€0.00</span>
          </div>
          <div class="total-row">
            <span>Manodopera:</span>
            <span id="laborTotal">€0.00</span>
          </div>
          <div class="total-row">
            <span>Subtotale:</span>
            <span id="subtotalAmount">€0.00</span>
          </div>
          <div class="total-row">
            <span>IVA 22%:</span>
            <span id="vatAmount">€0.00</span>
          </div>
          <div class="total-row grand-total">
            <span>TOTALE:</span>
            <span id="grandTotal">€0.00</span>
          </div>
        </div>
        
        <div style="margin-top: 16px;">
          <button class="btn btn--secondary" onclick="app.showAddQuoteItemModal()">
            ➕ Aggiungi Ricambio
          </button>
        </div>
      `;
      quoteHtml = itemsTable;
    }

    document.getElementById('orderQuote').innerHTML = quoteHtml;
    
    if (order.quote && order.quote.items && order.quote.items.length > 0) {
      this.updateQuoteTotals();
    }
  },

  showAddQuoteItemModal() {
    const modelSelect = document.getElementById('quotePartModelSelect');
    const partsSelect = document.getElementById('quotePartSelect');

    if (!modelSelect || !partsSelect) {
      this.openModal('addQuoteItemModal');
      return;
    }

    // Popola la select dei modelli a partire da appState.parts
    const models = Array.from(new Set(
      (appState.parts || [])
        .map(p => p.model)
        .filter(Boolean)
    )).sort();

    modelSelect.innerHTML = '<option value="">Seleziona modello...</option>' +
      models.map(m => `<option value="${m}">${m}</option>`).join('');

    // Reset lista ricambi finché non si sceglie un modello
    partsSelect.innerHTML = '<option value="">Seleziona ricambio...</option>';

    // Listener cambio modello (una sola volta)
    if (!modelSelect.dataset.bound) {
      modelSelect.addEventListener('change', (e) => {
        this.populateQuotePartsByModel(e.target.value);
      });
      modelSelect.dataset.bound = 'true';
    }

    this.openModal('addQuoteItemModal');
  },

  populateQuotePartsByModel(model) {
    const partsSelect = document.getElementById('quotePartSelect');
    if (!partsSelect) return;

    const parts = (appState.parts || []).filter(p => !model || p.model === model);

    partsSelect.innerHTML = '<option value="">Seleziona ricambio...</option>' +
      parts.map(part => `<option value="${part.id}">${part.name} - €${part.price}</option>`).join('');
  },

  addQuoteItem() {
    const form = document.getElementById('addQuoteItemForm');
    const formData = new FormData(form);
    const partId = parseInt(formData.get('partId'));
    const quantity = parseInt(formData.get('quantity'));

    const part = appState.parts.find(p => p.id === partId);
    if (!part) return;

    if (!appState.currentOrder.quote) {
      appState.currentOrder.quote = {
        items: [],
        labor: 0,
        subtotal: 0,
        vat: 0,
        total: 0
      };
    }

    appState.currentOrder.quote.items.push({
      partId: part.id,
      partName: part.name,
      price: part.price,
      quantity: quantity
    });

    this.closeModal('addQuoteItemModal');
    form.reset();
    this.renderQuoteSection(appState.currentOrder);
    this.showToast('Ricambio aggiunto al preventivo', 'success');
  },

  removeQuoteItem(index) {
    if (appState.currentOrder.quote && appState.currentOrder.quote.items) {
      appState.currentOrder.quote.items.splice(index, 1);
      this.renderQuoteSection(appState.currentOrder);
      this.showToast('Ricambio rimosso', 'success');
    }
  },

  updateQuoteTotals() {
    if (!appState.currentOrder.quote) return;

    const laborHoursInput = document.getElementById('laborHours');
    const laborHours = laborHoursInput ? parseFloat(laborHoursInput.value) || 0 : 0;
    
    // I prezzi dei ricambi e della manodopera sono già ivati
    const partsTotal = appState.currentOrder.quote.items.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    );
    const laborTotal = laborHours * appState.settings.laborCost;

    // Totale ivato reale
    const total = partsTotal + laborTotal;

    // Se vogliamo mostrare anche imponibile + IVA, li ricaviamo dal totale ivato
    const subtotal = total / 1.22; // imponibile teorico
    const vat = total - subtotal;  // IVA inclusa nel totale

    appState.currentOrder.quote.labor = laborHours;
    appState.currentOrder.quote.subtotal = subtotal;
    appState.currentOrder.quote.vat = vat;
    appState.currentOrder.quote.total = total;

    document.getElementById('partsTotal').textContent = `€${partsTotal.toFixed(2)}`;
    document.getElementById('laborTotal').textContent = `€${laborTotal.toFixed(2)}`;
    document.getElementById('subtotalAmount').textContent = `€${subtotal.toFixed(2)}`;
    document.getElementById('vatAmount').textContent = `€${vat.toFixed(2)}`;
    document.getElementById('grandTotal').textContent = `€${total.toFixed(2)}`;
  },

  showChangeStatusModal() {
    const select = document.getElementById('newStatusSelect');
    select.value = appState.currentOrder.status;
    this.openModal('changeStatusModal');
  },

  confirmChangeStatus() {
    const newStatus = document.getElementById('newStatusSelect').value;
    appState.currentOrder.status = newStatus;
    appState.currentOrder.timeline.push({
      status: newStatus,
      date: new Date()
    });

    this.closeModal('changeStatusModal');
    this.showOrderDetail(appState.currentOrder.id);
    this.showToast('Stato aggiornato con successo', 'success');
  },

  saveInternalNotes() {
    const notes = document.getElementById('internalNotes').value;
    appState.currentOrder.internalNotes = notes;
    this.showToast('Note salvate', 'success');
  },

  deleteOrder() {
    if (!confirm('Sei sicuro di voler eliminare questo ordine?')) return;

    const index = appState.orders.findIndex(o => o.id === appState.currentOrder.id);
    if (index !== -1) {
      appState.orders.splice(index, 1);
      this.showToast('Ordine eliminato', 'success');
      this.showPage('orders');
    }
  },

  printWorkOrder() {
    const order = appState.currentOrder;
    if (!order) return;
    
    const accessories = order.device.accessories ? order.device.accessories.split(',').map(a => a.trim()) : [];
    
    const template = `
      <div class="work-order-template">
        <!-- HEADER -->
        <div class="wo-header">
          <div>
            <div class="wo-logo">Fixit Repair Express</div>
            <div style="font-size: 10pt; color: #555;">Laboratorio Riparazioni Professionali</div>
          </div>
          <div class="wo-company-info">
            <strong>${appState.settings.companyName}</strong><br>
            Via Roma 123<br>
            20100 Milano (MI)<br>
            Tel: 02-1234567<br>
            Email: info@techrepair.it<br>
            P.IVA: IT12345678901
          </div>
        </div>
        
        <!-- TITLE -->
        <div class="wo-title">
          <h1>Scheda di Lavorazione</h1>
          <div class="wo-order-number">${order.number}</div>
        </div>
        
        <!-- CLIENT SECTION -->
        <div class="wo-section">
          <div class="wo-section-title">DATI CLIENTE</div>
          <div class="wo-grid">
            <div class="wo-field">
              <div class="wo-field-label">Nome e Cognome:</div>
              <div class="wo-field-value">${order.customer.name} ${order.customer.surname}</div>
            </div>
            <div class="wo-field">
              <div class="wo-field-label">Telefono:</div>
              <div class="wo-field-value">${order.customer.phone}</div>
            </div>
            <div class="wo-field">
              <div class="wo-field-label">Email:</div>
              <div class="wo-field-value">${order.customer.email || '-'}</div>
            </div>
            <div class="wo-field">
              <div class="wo-field-label">Data Accettazione:</div>
              <div class="wo-field-value">${this.formatDate(order.createdAt)}</div>
            </div>
          </div>
          <div class="wo-field">
            <div class="wo-field-label">Priorità:</div>
            <div class="wo-field-value">
              <span class="wo-priority-badge wo-priority-${order.problem.priority.toLowerCase()}">
                ${order.problem.priority.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        
        <!-- DEVICE SECTION -->
        <div class="wo-section">
          <div class="wo-section-title">DISPOSITIVO IN RIPARAZIONE</div>
          <div class="wo-grid">
            <div class="wo-field">
              <div class="wo-field-label">Tipo e Modello:</div>
              <div class="wo-field-value" style="font-size: 13pt; font-weight: bold;">${order.device.type} ${order.device.model}</div>
            </div>
            <div class="wo-field">
              <div class="wo-field-label">Numero Seriale/IMEI:</div>
              <div class="wo-field-value">${order.device.serial || 'Non fornito'}</div>
            </div>
          </div>
          <div class="wo-field">
            <div class="wo-field-label">Condizioni all'Arrivo:</div>
            <div class="wo-field-value">${order.device.condition || 'Non specificato'}</div>
          </div>
          ${accessories.length > 0 ? `
            <div class="wo-field">
              <div class="wo-field-label">Accessori Consegnati:</div>
              <ul class="wo-accessories-list">
                ${accessories.map(acc => `<li>${acc}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
        
        <!-- PROBLEM SECTION -->
        <div class="wo-section">
          <div class="wo-section-title">PROBLEMA RISCONTRATO</div>
          <div class="wo-field">
            <div class="wo-field-label">Categoria Problema:</div>
            <div class="wo-field-value"><strong>${order.problem.category}</strong></div>
          </div>
          <div class="wo-field">
            <div class="wo-field-label">Descrizione Dettagliata:</div>
            <div class="wo-field-value">${order.problem.description}</div>
          </div>
          ${order.customer.notes ? `
            <div class="wo-field">
              <div class="wo-field-label">Note Cliente:</div>
              <div class="wo-field-value">${order.customer.notes}</div>
            </div>
          ` : ''}
        </div>
        
        <!-- DIAGNOSTIC SECTION -->
        <div class="wo-section">
          <div class="wo-section-title">DIAGNOSI TECNICA (compilare manualmente)</div>
          <div class="wo-checkboxes">
            <div class="wo-checkbox-item">
              <span class="wo-checkbox"></span> Display
            </div>
            <div class="wo-checkbox-item">
              <span class="wo-checkbox"></span> Batteria
            </div>
            <div class="wo-checkbox-item">
              <span class="wo-checkbox"></span> Hardware
            </div>
            <div class="wo-checkbox-item">
              <span class="wo-checkbox"></span> Software
            </div>
            <div class="wo-checkbox-item">
              <span class="wo-checkbox"></span> Altro
            </div>
          </div>
          <div class="wo-notes-area" style="margin-top: 12px; min-height: 60px;">
            <!-- Area per note manuali -->
          </div>
        </div>
        
        <!-- INTERVENTION SECTION -->
        <div class="wo-section">
          <div class="wo-section-title">INTERVENTO EFFETTUATO</div>
          <table class="wo-table">
            <thead>
              <tr>
                <th style="width: 45%;">Ricambi Utilizzati</th>
                <th style="width: 20%;">Codice</th>
                <th style="width: 10%;">Q.tà</th>
                <th style="width: 25%; text-align: right;">Prezzo</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
              <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
              <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
            </tbody>
          </table>
          <div class="wo-field" style="margin-top: 12px;">
            <strong>Manodopera:</strong> ore _______ x €35/h = € _______
          </div>
          <div class="wo-field" style="margin-top: 12px;">
            <div class="wo-field-label">Note Intervento:</div>
            <div class="wo-notes-area" style="min-height: 50px;"></div>
          </div>
        </div>
        
        <!-- QUOTE SECTION (if exists) -->
        ${order.quote && order.quote.items && order.quote.items.length > 0 ? `
          <div class="wo-section">
            <div class="wo-section-title">PREVENTIVO</div>
            <table class="wo-table">
              <thead>
                <tr>
                  <th>Ricambio</th>
                  <th style="width: 60px; text-align: center;">Q.tà</th>
                  <th style="width: 80px; text-align: right;">Prezzo</th>
                  <th style="width: 80px; text-align: right;">Totale</th>
                </tr>
              </thead>
              <tbody>
                ${order.quote.items.map(item => `
                  <tr>
                    <td>${item.partName}</td>
                    <td style="text-align: center;">${item.quantity}</td>
                    <td style="text-align: right;">€${item.price.toFixed(2)}</td>
                    <td style="text-align: right;">€${(item.price * item.quantity).toFixed(2)}</td>
                  </tr>
                `).join('')}
                ${order.quote.labor > 0 ? `
                  <tr>
                    <td>Manodopera tecnica (${order.quote.labor}h)</td>
                    <td style="text-align: center;">1</td>
                    <td style="text-align: right;">€${(order.quote.labor * appState.settings.laborCost).toFixed(2)}</td>
                    <td style="text-align: right;">€${(order.quote.labor * appState.settings.laborCost).toFixed(2)}</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
            <div class="wo-totals-box">
              <div class="wo-total-row">
                <span>Subtotale:</span>
                <span>€${order.quote.subtotal.toFixed(2)}</span>
              </div>
              <div class="wo-total-row">
                <span>IVA 22%:</span>
                <span>€${order.quote.vat.toFixed(2)}</span>
              </div>
              <div class="wo-total-row grand-total">
                <span>TOTALE:</span>
                <span>€${order.quote.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ` : ''}
        
        <!-- STATUS TIMELINE -->
        <div class="wo-section">
          <div class="wo-section-title">STATO LAVORAZIONE</div>
          <div class="wo-timeline">
            <div class="wo-timeline-item">
              <span class="wo-checkbox"></span> Preventivo
            </div>
            <div class="wo-timeline-item">
              <span class="wo-checkbox"></span> Approvato
            </div>
            <div class="wo-timeline-item">
              <span class="wo-checkbox"></span> In Lavorazione
            </div>
            <div class="wo-timeline-item">
              <span class="wo-checkbox"></span> Completato
            </div>
            <div class="wo-timeline-item">
              <span class="wo-checkbox"></span> Consegnato
            </div>
          </div>
        </div>
        
        <!-- SIGNATURES -->
        <div class="wo-signatures">
          <div class="wo-signature-box">
            <div><strong>Firma Tecnico</strong></div>
            <div class="wo-signature-line">Data: __/__/____</div>
          </div>
          <div class="wo-signature-box">
            <div><strong>Firma Cliente</strong></div>
            <div><small>(autorizzazione riparazione)</small></div>
            <div class="wo-signature-line">Data: __/__/____</div>
          </div>
          <div class="wo-signature-box">
            <div><strong>Firma Cliente</strong></div>
            <div><small>(ritiro dispositivo)</small></div>
            <div class="wo-signature-line">Data: __/__/____</div>
          </div>
        </div>
        
        <!-- FOOTER -->
        <div class="wo-footer">
          <strong>Condizioni generali:</strong> La merce viaggia a rischio e pericolo del committente.<br>
          Garanzia 6 mesi sui ricambi originali installati, 3 mesi sui compatibili.<br>
          I dispositivi non ritirati entro 90 giorni potranno essere smaltiti.
        </div>
      </div>
    `;
    
    this.showPrintPreview(template);
  },

  showPrintPreview(htmlContent) {
    const modal = document.getElementById('printPreviewModal');
    const content = document.getElementById('printPreviewContent');
    
    content.innerHTML = htmlContent;
    modal.classList.add('show');
    
    // Disable body scroll
    document.body.style.overflow = 'hidden';
  },

  closePrintPreview() {
    const modal = document.getElementById('printPreviewModal');
    modal.classList.remove('show');
    
    // Re-enable body scroll
    document.body.style.overflow = '';
  },

  updateClientsList() {
    const clientsMap = new Map();

    appState.orders.forEach(order => {
      const key = order.customer.phone;
      if (!clientsMap.has(key)) {
        clientsMap.set(key, {
          name: order.customer.name,
          surname: order.customer.surname,
          phone: order.customer.phone,
          email: order.customer.email,
          orders: []
        });
      }
      const c = clientsMap.get(key);
      c.orders.push(order);
      // Always keep the most recent name/email if updated on a more recent order
      const lastDate = c._lastDate || 0;
      const orderDate = new Date(order.dateCreated || order.timeline?.[0]?.date || 0).getTime();
      if (orderDate >= lastDate) {
        c._lastDate = orderDate;
        if (order.customer.name) c.name = order.customer.name;
        if (order.customer.surname) c.surname = order.customer.surname;
        if (order.customer.email) c.email = order.customer.email;
      }
    });

    appState.clients = Array.from(clientsMap.values()).sort((a, b) =>
      `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`)
    );
  },

  // Aggregated stats for a client (used in cards and detail modal)
  _clientStats(client) {
    const total = client.orders.reduce((sum, o) => {
      const v = o.quote?.total ?? o.totalAmount ?? 0;
      return sum + (typeof v === 'number' ? v : 0);
    }, 0);
    const dates = client.orders
      .map(o => new Date(o.dateCreated || o.timeline?.[0]?.date || 0).getTime())
      .filter(t => t > 0);
    const lastTs = dates.length ? Math.max(...dates) : 0;
    const lastDate = lastTs ? new Date(lastTs).toLocaleDateString('it-IT') : '-';
    const completed = client.orders.filter(o =>
      o.status === 'Completato' || o.status === 'Consegnato'
    ).length;
    return { total, lastDate, completed };
  },

  // Sanitize phone for tel: / wa.me links
  _sanitizePhone(phone) {
    return (phone || '').replace(/[^\d+]/g, '');
  },

  renderClientsList() {
    const searchQuery = (document.getElementById('clientSearchInput')?.value || '').toLowerCase().trim();

    let filteredClients = appState.clients;

    if (searchQuery) {
      filteredClients = filteredClients.filter(c => {
        const fullName = `${c.name || ''} ${c.surname || ''}`.toLowerCase();
        return fullName.includes(searchQuery)
          || (c.phone || '').toLowerCase().includes(searchQuery)
          || (c.email || '').toLowerCase().includes(searchQuery);
      });
    }

    const clientsList = document.getElementById('clientsList');
    if (!clientsList) return;

    if (filteredClients.length === 0) {
      clientsList.innerHTML = `
        <div class="catalog-empty-state">
          <div class="empty-icon">👤</div>
          <h3>${searchQuery ? 'Nessun cliente trovato' : 'Nessun cliente'}</h3>
          <p>${searchQuery ? `Nessun risultato per "${searchQuery}"` : 'I clienti compaiono qui dopo aver creato una riparazione.'}</p>
        </div>
      `;
      return;
    }

    clientsList.innerHTML = filteredClients.map(client => {
      const stats = this._clientStats(client);
      const phoneSafe = client.phone.replace(/'/g, "\\'");
      const telLink = this._sanitizePhone(client.phone);
      const initials = ((client.name?.[0] || '') + (client.surname?.[0] || '')).toUpperCase() || '?';

      return `
        <div class="client-card" onclick="app.showClientDetail('${phoneSafe}')">
          <div class="client-card__top">
            <div class="client-avatar">${initials}</div>
            <div class="client-card__id">
              <div class="client-name">${client.name || ''} ${client.surname || ''}</div>
              <div class="client-info">📞 ${client.phone || '-'}</div>
              ${client.email ? `<div class="client-info">✉️ ${client.email}</div>` : ''}
            </div>
            <button class="client-edit-btn" onclick="event.stopPropagation(); app.editClient('${phoneSafe}')" title="Modifica cliente">
              ✏️
            </button>
          </div>
          <div class="client-card__stats">
            <div class="client-stat"><span class="client-stat__num">${client.orders.length}</span><span class="client-stat__lbl">Riparazioni</span></div>
            <div class="client-stat"><span class="client-stat__num">${stats.completed}</span><span class="client-stat__lbl">Completate</span></div>
            <div class="client-stat"><span class="client-stat__num">€${stats.total.toFixed(0)}</span><span class="client-stat__lbl">Totale</span></div>
          </div>
          <div class="client-card__meta">Ultima attività: ${stats.lastDate}</div>
          <div class="client-card__actions" onclick="event.stopPropagation()">
            <a href="tel:${telLink}" class="btn btn--sm btn--ghost" title="Chiama">📞 Chiama</a>
            <a href="https://wa.me/${telLink.replace('+','')}" target="_blank" rel="noopener" class="btn btn--sm btn--ghost" title="WhatsApp">💬 WhatsApp</a>
            ${client.email ? `<a href="mailto:${client.email}" class="btn btn--sm btn--ghost" title="Email">✉️ Email</a>` : ''}
            <button class="btn btn--sm btn--ghost" onclick="app.showClientOrders('${phoneSafe}')" title="Vedi tutte le riparazioni">📋 Riparazioni</button>
          </div>
        </div>
      `;
    }).join('');
  },

  showClientOrders(phone) {
    appState.orderClientFilterPhone = phone;
    this.showPage('orders');
  },

  // Show detail modal with full repair history
  showClientDetail(phone) {
    const client = appState.clients.find(c => c.phone === phone);
    if (!client) return;

    document.getElementById('clientDetailName').textContent =
      `${client.name || ''} ${client.surname || ''}`.trim() || 'Cliente';

    const stats = this._clientStats(client);
    const telLink = this._sanitizePhone(client.phone);

    const orders = [...client.orders].sort((a, b) => {
      const da = new Date(a.dateCreated || 0).getTime();
      const db = new Date(b.dateCreated || 0).getTime();
      return db - da;
    });

    const body = document.getElementById('clientDetailBody');
    body.innerHTML = `
      <div class="client-detail-summary">
        <div class="client-detail-info">
          <div><strong>📞</strong> ${client.phone || '-'}</div>
          <div><strong>✉️</strong> ${client.email || '-'}</div>
          <div><strong>Ultima attività:</strong> ${stats.lastDate}</div>
        </div>
        <div class="client-detail-stats">
          <div class="client-stat"><span class="client-stat__num">${client.orders.length}</span><span class="client-stat__lbl">Totali</span></div>
          <div class="client-stat"><span class="client-stat__num">${stats.completed}</span><span class="client-stat__lbl">Completate</span></div>
          <div class="client-stat"><span class="client-stat__num">€${stats.total.toFixed(2)}</span><span class="client-stat__lbl">Speso</span></div>
        </div>
      </div>
      <div class="client-detail-actions">
        <a href="tel:${telLink}" class="btn btn--sm btn--secondary">📞 Chiama</a>
        <a href="https://wa.me/${telLink.replace('+','')}" target="_blank" rel="noopener" class="btn btn--sm btn--secondary">💬 WhatsApp</a>
        ${client.email ? `<a href="mailto:${client.email}" class="btn btn--sm btn--secondary">✉️ Email</a>` : ''}
        <button class="btn btn--sm btn--primary" onclick="app.editClient('${phone.replace(/'/g, "\\'")}')">✏️ Modifica</button>
      </div>
      <h4 class="client-detail-section">Riparazioni (${orders.length})</h4>
      <div class="client-detail-orders">
        ${orders.length === 0 ? '<p class="text-muted">Nessuna riparazione</p>' : orders.map(o => `
          <div class="client-order-row" onclick="app.closeModal('clientDetailModal'); app.showOrderDetail(${o.id})">
            <div class="client-order-row__main">
              <div class="client-order-row__num">${o.number || '-'}</div>
              <div class="client-order-row__device">${o.device?.type || ''} ${o.device?.model || ''}</div>
            </div>
            <div class="client-order-row__meta">
              <span class="status-badge">${o.status || ''}</span>
              <span class="client-order-row__date">${o.dateCreated ? new Date(o.dateCreated).toLocaleDateString('it-IT') : ''}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    this.openModal('clientDetailModal');
  },

  editClient(phone) {
    const client = appState.clients.find(c => c.phone === phone);
    if (!client) return;

    const form = document.getElementById('editClientForm');
    if (!form) return;

    form.elements['originalPhone'].value = client.phone;
    form.elements['name'].value = client.name || '';
    form.elements['surname'].value = client.surname || '';
    form.elements['phone'].value = client.phone || '';
    form.elements['email'].value = client.email || '';

    this.openModal('editClientModal');
  },

  saveEditedClient() {
    const form = document.getElementById('editClientForm');
    if (!form) return;
    const fd = new FormData(form);

    const originalPhone = fd.get('originalPhone');
    const name = (fd.get('name') || '').trim();
    const surname = (fd.get('surname') || '').trim();
    const phone = (fd.get('phone') || '').trim();
    const email = (fd.get('email') || '').trim();

    if (!name || !surname || !phone) {
      this.showToast('Compila nome, cognome e telefono', 'error');
      return;
    }

    // If phone changed, ensure no other client uses the new phone
    if (phone !== originalPhone) {
      const conflict = appState.clients.some(c => c.phone === phone);
      if (conflict) {
        this.showToast('Esiste già un cliente con questo telefono', 'error');
        return;
      }
    }

    // Propagate changes to all orders linked to this client
    let updatedCount = 0;
    appState.orders.forEach(order => {
      if (order.customer && order.customer.phone === originalPhone) {
        order.customer.name = name;
        order.customer.surname = surname;
        order.customer.phone = phone;
        order.customer.email = email;
        updatedCount++;
      }
    });

    try {
      localStorage.setItem('nowfixit_orders', JSON.stringify(appState.orders));
    } catch (e) {
      console.warn('Impossibile salvare ordini aggiornati:', e);
    }

    this.updateClientsList();
    this.closeModal('editClientModal');
    this.renderClientsList();
    this.showToast(`Cliente aggiornato (${updatedCount} riparazioni allineate)`, 'success');
  },

  renderSettings() {
    // Company settings are already in the form
  },

  // ==========================================
  // Folder-based parts management v2
  // ==========================================
  selectedFolder: null,
  partsSearchQuery: '',

  // Persist parts and folders to localStorage
  _savePartsState() {
    try {
      // Strip any legacy _FOLDER_ placeholders before saving
      const clean = appState.parts.filter(p => p && p.name !== '_FOLDER_');
      localStorage.setItem('nowfixit_parts', JSON.stringify(clean));
      localStorage.setItem('nowfixit_parts_folders', JSON.stringify(appState.partsFolders));
    } catch (e) {
      console.warn('Impossibile salvare parts/folders:', e);
    }
  },

  // Returns the canonical folder list: explicit folders ∪ models referenced by parts
  _getAllFolders() {
    const fromParts = appState.parts
      .filter(p => p.name !== '_FOLDER_')
      .map(p => p.model)
      .filter(Boolean);
    const all = new Set([...(appState.partsFolders || []), ...fromParts]);
    return [...all].sort((a, b) => a.localeCompare(b));
  },

  renderPartsPage() {
    this.updateFolderList();
    this.populateFolderSelect();

    if (this.selectedFolder) {
      this.showFolderParts(this.selectedFolder);
    }
  },

  updateFolderList() {
    const folderList = document.getElementById('folderList');
    if (!folderList) return;

    const folders = this._getAllFolders();

    if (folders.length === 0) {
      folderList.innerHTML = `
        <div class="folder-empty">
          <p>Nessuna cartella</p>
          <button class="btn btn--sm btn--primary" onclick="app.showAddFolderModal()">
            📁 Crea la prima cartella
          </button>
        </div>
      `;
      return;
    }

    folderList.innerHTML = folders.map(model => {
      const partsInFolder = appState.parts.filter(p => p.model === model && p.name !== '_FOLDER_');
      const totalStock = partsInFolder.reduce((sum, p) => sum + (p.stock ?? 0), 0);
      const isSelected = this.selectedFolder === model;
      const safeName = model.replace(/'/g, "\\'");

      return `
        <div class="folder-item ${isSelected ? 'folder-item--selected' : ''}" onclick="app.selectFolder('${safeName}')">
          <div class="folder-icon">📁</div>
          <div class="folder-info">
            <div class="folder-name">${model}</div>
            <div class="folder-meta">${partsInFolder.length} ricambi • ${totalStock} pz totali</div>
          </div>
        </div>
      `;
    }).join('');
  },

  selectFolder(folderName) {
    this.selectedFolder = folderName;
    this.partsSearchQuery = '';
    this.updateFolderList();
    this.showFolderParts(folderName);

    const addBtn = document.getElementById('addPartToFolderBtn');
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.textContent = `➕ Aggiungi a ${folderName}`;
    }
  },

  showFolderParts(folderName) {
    const contentContainer = document.getElementById('partsCatalogContent');
    const footerContainer = document.getElementById('partsCatalogFooter');
    const titleEl = document.getElementById('selectedFolderTitle');
    const headerEl = document.getElementById('partsContentHeader');

    if (!contentContainer) return;

    if (titleEl) titleEl.textContent = `📁 ${folderName}`;

    // Render header actions (rename / delete folder + search)
    if (headerEl) {
      const safeName = folderName.replace(/'/g, "\\'");
      headerEl.innerHTML = `
        <div class="content-header__title">
          <h3 id="selectedFolderTitle">📁 ${folderName}</h3>
          <div class="folder-actions">
            <button class="btn btn--ghost btn--sm" onclick="app.renameFolder('${safeName}')" title="Rinomina cartella">✏️ Rinomina</button>
            <button class="btn btn--ghost btn--sm btn--danger-ghost" onclick="app.deleteFolder('${safeName}')" title="Elimina cartella">🗑️ Elimina</button>
          </div>
        </div>
        <div class="content-header__tools">
          <input type="search" class="form-control parts-search-input" id="partsSearchInput"
                 placeholder="🔍 Cerca ricambio..." value="${this.partsSearchQuery || ''}"
                 oninput="app.onPartsSearchInput(this.value)">
          <button class="btn btn--sm btn--primary" id="addPartToFolderBtn" onclick="app.showAddPartModal()">
            ➕ Aggiungi a ${folderName}
          </button>
        </div>
      `;
    }

    let filteredParts = appState.parts.filter(part => part.model === folderName && part.name !== '_FOLDER_');

    const q = (this.partsSearchQuery || '').trim().toLowerCase();
    if (q) {
      filteredParts = filteredParts.filter(p => (p.name || '').toLowerCase().includes(q));
    }

    if (filteredParts.length === 0) {
      contentContainer.innerHTML = `
        <div class="catalog-empty-state">
          <div class="empty-icon">📦</div>
          <h3>${q ? 'Nessun risultato' : 'Cartella vuota'}</h3>
          <p>${q ? `Nessun ricambio corrisponde a "${q}".` : 'Non ci sono ricambi in questa cartella.'}</p>
          ${q ? '' : `<button class="btn btn--primary btn--lg" onclick="app.showAddPartModal()">➕ Aggiungi Ricambio</button>`}
        </div>
      `;
      if (footerContainer) footerContainer.innerHTML = '';
      return;
    }

    filteredParts.sort((a, b) => a.name.localeCompare(b.name));

    contentContainer.innerHTML = `
      <div class="parts-grid-new">
        ${filteredParts.map(part => {
          const stockLevel = part.stock ?? 0;
          const minStock = part.minStock ?? 0;
          const isLowStock = stockLevel > 0 && stockLevel <= minStock;
          const isOutOfStock = stockLevel === 0;

          return `
            <div class="part-card ${isOutOfStock ? 'part-card--out' : isLowStock ? 'part-card--low' : ''}">
              <div class="part-card__top">
                <div class="part-card__icon">🔩</div>
                <div class="part-card__meta">
                  ${isOutOfStock ? '<span class="part-card__badge part-card__badge--out">Esaurito</span>' : isLowStock ? '<span class="part-card__badge part-card__badge--low">Scorta bassa</span>' : ''}
                </div>
              </div>
              <h4 class="part-card__name">${part.name}</h4>
              <div class="part-card__body">
                <div class="part-card__price">€${(part.price || 0).toFixed(2)}</div>
                <div class="part-card__stock-row">
                  <button class="btn-icon btn-neg" onclick="app.changePartStock(${part.id}, -1)" ${stockLevel <= 0 ? 'disabled' : ''} title="Diminuisci">−</button>
                  <span class="part-card__stock-count ${isOutOfStock ? 'stock-out' : isLowStock ? 'stock-warning' : 'stock-good'}">${stockLevel} pz</span>
                  <button class="btn-icon btn-pos" onclick="app.changePartStock(${part.id}, 1)" title="Aumenta">+</button>
                </div>
              </div>
              <div class="part-card__footer">
                <button class="btn-icon btn-edit" onclick="app.editPart(${part.id})" title="Modifica">✏️</button>
                <button class="btn-icon btn-delete" onclick="app.deletePart(${part.id})" title="Elimina">🗑️</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const lowStockCount = filteredParts.filter(p => (p.stock ?? 0) <= (p.minStock ?? 0)).length;
    if (footerContainer) {
      footerContainer.innerHTML = `
        <div class="catalog-stats">
          <div class="stat-item">
            <span class="stat-value">${filteredParts.length}</span>
            <span class="stat-label">Ricambi</span>
          </div>
          <div class="stat-item">
            <span class="stat-value warning">${lowStockCount}</span>
            <span class="stat-label">Scorta Bassa</span>
          </div>
        </div>
      `;
    }
  },

  onPartsSearchInput(value) {
    this.partsSearchQuery = value || '';
    if (this.selectedFolder) {
      this.showFolderParts(this.selectedFolder);
      // Restore focus on the search input
      const input = document.getElementById('partsSearchInput');
      if (input) {
        input.focus();
        const v = input.value;
        input.value = '';
        input.value = v;
      }
    }
  },

  showAddFolderModal() {
    const form = document.getElementById('addFolderForm');
    if (form) form.reset();
    this.openModal('addFolderModal');
  },

  addFolder() {
    const form = document.getElementById('addFolderForm');
    if (!form) return;

    const formData = new FormData(form);
    const folderName = (formData.get('folderName') || '').trim();

    if (!folderName) {
      this.showToast('Inserisci un nome per la cartella', 'error');
      return;
    }

    const existing = this._getAllFolders().map(f => f.toLowerCase());
    if (existing.includes(folderName.toLowerCase())) {
      this.showToast('Questa cartella esiste già', 'error');
      return;
    }

    if (!appState.partsFolders.includes(folderName)) {
      appState.partsFolders.push(folderName);
    }
    this._savePartsState();

    this.closeModal('addFolderModal');
    form.reset();
    this.selectedFolder = folderName;
    this.renderPartsPage();
    this.showToast(`Cartella "${folderName}" creata`, 'success');
  },

  renameFolder(oldName) {
    const newName = (prompt('Nuovo nome cartella', oldName) || '').trim();
    if (!newName || newName === oldName) return;

    const existing = this._getAllFolders().map(f => f.toLowerCase());
    if (existing.includes(newName.toLowerCase())) {
      this.showToast('Esiste già una cartella con questo nome', 'error');
      return;
    }

    // Update folders list
    const idx = appState.partsFolders.indexOf(oldName);
    if (idx !== -1) appState.partsFolders[idx] = newName;
    else appState.partsFolders.push(newName);

    // Update parts referencing the old name
    appState.parts.forEach(p => {
      if (p.model === oldName) p.model = newName;
    });

    if (this.selectedFolder === oldName) this.selectedFolder = newName;

    this._savePartsState();
    this.renderPartsPage();
    this.showToast(`Cartella rinominata in "${newName}"`, 'success');
  },

  deleteFolder(folderName) {
    const partsInFolder = appState.parts.filter(p => p.model === folderName && p.name !== '_FOLDER_');
    const msg = partsInFolder.length > 0
      ? `La cartella "${folderName}" contiene ${partsInFolder.length} ricambi. Eliminarla insieme a tutti i ricambi?`
      : `Eliminare la cartella "${folderName}"?`;
    if (!confirm(msg)) return;

    appState.parts = appState.parts.filter(p => p.model !== folderName);
    appState.partsFolders = appState.partsFolders.filter(f => f !== folderName);

    if (this.selectedFolder === folderName) {
      this.selectedFolder = null;
      const headerEl = document.getElementById('partsContentHeader');
      if (headerEl) {
        headerEl.innerHTML = `<h3 id="selectedFolderTitle">Seleziona una cartella</h3>`;
      }
      const contentContainer = document.getElementById('partsCatalogContent');
      if (contentContainer) {
        contentContainer.innerHTML = `
          <div class="catalog-empty-state">
            <div class="empty-icon">📁</div>
            <h3>Seleziona una cartella</h3>
            <p>Scegli un modello iPhone dalla lista a sinistra per vedere i ricambi</p>
          </div>
        `;
      }
      const footerContainer = document.getElementById('partsCatalogFooter');
      if (footerContainer) footerContainer.innerHTML = '';
    }

    this._savePartsState();
    this.renderPartsPage();
    this.showToast(`Cartella "${folderName}" eliminata`, 'success');
  },

  populateFolderSelect() {
    const select = document.getElementById('partFolderSelect');
    if (!select) return;

    const folders = this._getAllFolders();

    let html = '<option value="">Seleziona cartella...</option>';
    folders.forEach(model => {
      const selected = this.selectedFolder === model ? 'selected' : '';
      html += `<option value="${model}" ${selected}>${model}</option>`;
    });

    select.innerHTML = html;
  },

  saveSettings() {
    const form = document.getElementById('companySettingsForm');
    const formData = new FormData(form);

    appState.settings.companyName = formData.get('companyName');
    appState.settings.companyVat = formData.get('companyVat');
    appState.settings.companyAddress = formData.get('companyAddress');
    appState.settings.companyPhone = formData.get('companyPhone');
    appState.settings.companyEmail = formData.get('companyEmail');
    appState.settings.laborCost = parseFloat(formData.get('laborCost'));

    this.showToast('Impostazioni salvate con successo', 'success');
  },

  showAddPartModal() {
    this.populateFolderSelect();
    // Pre-select current folder if open
    const select = document.getElementById('partFolderSelect');
    if (select && this.selectedFolder) select.value = this.selectedFolder;
    this.openModal('addPartModal');
  },

  addPart() {
    const form = document.getElementById('addPartForm');
    const formData = new FormData(form);

    const folderName = (formData.get('partFolder') || this.selectedFolder || '').trim();
    if (!folderName) {
      this.showToast('Seleziona una cartella per il ricambio', 'error');
      return;
    }

    const partName = (formData.get('partName') || '').trim();
    if (!partName) {
      this.showToast('Inserisci il nome del ricambio', 'error');
      return;
    }

    // Ensure folder is registered
    if (!appState.partsFolders.includes(folderName)) {
      appState.partsFolders.push(folderName);
    }

    // Remove any legacy _FOLDER_ placeholder
    appState.parts = appState.parts.filter(p => !(p.model === folderName && p.name === '_FOLDER_'));

    const newPart = {
      id: appState.parts.length > 0 ? Math.max(...appState.parts.map(p => p.id)) + 1 : 1,
      name: partName,
      model: folderName,
      price: parseFloat(formData.get('partPrice')) || 0,
      stock: parseInt(formData.get('partStock')) || 0,
      minStock: parseInt(formData.get('partMinStock')) || 1
    };

    appState.parts.push(newPart);
    this.selectedFolder = folderName;
    this._savePartsState();

    this.closeModal('addPartModal');
    form.reset();
    this.renderPartsPage();
    this.showToast(`Ricambio aggiunto a "${folderName}"`, 'success');
  },

  changePartStock(partId, delta) {
    const part = appState.parts.find(p => p.id === partId);
    if (!part) return;

    const newStock = (part.stock ?? 0) + delta;
    part.stock = newStock < 0 ? 0 : newStock;
    this._savePartsState();
    this.renderPartsPage();
  },

  // Real modal-based edit (replaces prompt() chain)
  _editingPartId: null,

  editPart(partId) {
    const part = appState.parts.find(p => p.id === partId);
    if (!part) return;

    this._editingPartId = partId;

    // Populate folder select
    const folderSelect = document.getElementById('editPartFolderSelect');
    if (folderSelect) {
      const folders = this._getAllFolders();
      folderSelect.innerHTML = folders
        .map(f => `<option value="${f}" ${f === part.model ? 'selected' : ''}>${f}</option>`)
        .join('');
    }

    const form = document.getElementById('editPartForm');
    if (form) {
      form.elements['partName'].value = part.name || '';
      form.elements['partPrice'].value = part.price ?? 0;
      form.elements['partStock'].value = part.stock ?? 0;
      form.elements['partMinStock'].value = part.minStock ?? 0;
    }

    this.openModal('editPartModal');
  },

  saveEditedPart() {
    if (this._editingPartId == null) return;
    const part = appState.parts.find(p => p.id === this._editingPartId);
    if (!part) return;

    const form = document.getElementById('editPartForm');
    if (!form) return;
    const formData = new FormData(form);

    const newName = (formData.get('partName') || '').trim();
    const newFolder = (formData.get('partFolder') || part.model || '').trim();
    if (!newName || !newFolder) {
      this.showToast('Compila nome e cartella', 'error');
      return;
    }

    part.name = newName;
    part.model = newFolder;
    part.price = parseFloat(formData.get('partPrice')) || 0;
    part.stock = parseInt(formData.get('partStock')) || 0;
    part.minStock = parseInt(formData.get('partMinStock')) || 0;

    if (!appState.partsFolders.includes(newFolder)) {
      appState.partsFolders.push(newFolder);
    }

    this._editingPartId = null;
    this._savePartsState();
    this.closeModal('editPartModal');
    this.renderPartsPage();
    this.showToast('Ricambio aggiornato', 'success');
  },

  deletePart(partId) {
    if (!confirm('Sei sicuro di voler eliminare questo ricambio?')) return;

    const index = appState.parts.findIndex(p => p.id === partId);
    if (index !== -1) {
      appState.parts.splice(index, 1);
      this._savePartsState();
      this.renderPartsPage();
      this.showToast('Ricambio eliminato', 'success');
    }
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
    }
  },

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  },

  formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  },

  formatDateTime(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  },

  // REFURBISHED DEVICES METHODS
  renderRefurbishedDevices() {
    const typeFilter = document.getElementById('refurbishedTypeFilter')?.value || '';
    const gradeFilter = document.getElementById('refurbishedGradeFilter')?.value || '';
    const statusFilter = document.getElementById('refurbishedStatusFilter')?.value || '';
    const searchQuery = document.getElementById('refurbishedSearchInput')?.value.toLowerCase() || '';

    let filtered = appState.refurbishedDevices;

    if (typeFilter) filtered = filtered.filter(d => d.tipo === typeFilter);
    if (gradeFilter) filtered = filtered.filter(d => d.grado === gradeFilter);
    if (statusFilter) filtered = filtered.filter(d => d.stato === statusFilter);
    if (searchQuery) {
      filtered = filtered.filter(d => 
        d.modello.toLowerCase().includes(searchQuery) ||
        d.seriale.toLowerCase().includes(searchQuery)
      );
    }

    const grid = document.getElementById('refurbishedGrid');
    if (!grid) return;

    if (filtered.length === 0) {
      grid.innerHTML = '<p style="color: var(--color-text-secondary); text-align: center; padding: 40px;">Nessun dispositivo trovato</p>';
      return;
    }

    grid.innerHTML = filtered.map(device => `
      <div class="device-card">
        <div class="device-card-header">
          <div class="device-card-title">${device.modello}</div>
          <div class="device-card-subtitle">${device.capacita} - ${device.colore}</div>
        </div>
        <div class="device-card-body">
          <div class="device-info-row">
            <span class="device-info-label">Seriale:</span>
            <span class="device-info-value">${device.seriale}</span>
          </div>
          <div class="device-info-row">
            <span class="device-info-label">Grado:</span>
            <span class="device-info-value">
              <span class="grade-badge grade-${device.grado.toLowerCase().replace('+', '-plus')}">${device.grado}</span>
            </span>
          </div>
          <div class="device-info-row">
            <span class="device-info-label">Batteria:</span>
            <span class="device-info-value">${device.batteria}%</span>
          </div>
          <div class="device-info-row">
            <span class="device-info-label">Accessori:</span>
            <span class="device-info-value">${device.accessori.length > 0 ? device.accessori.join(', ') : 'Nessuno'}</span>
          </div>
          <div class="device-info-row">
            <span class="device-info-label">Stato:</span>
            <span class="device-info-value">
              <span class="status-badge" style="background: ${device.stato === 'Disponibile' ? '#10b98120' : device.stato === 'Riservato' ? '#f59e0b20' : '#6b728020'}; color: ${device.stato === 'Disponibile' ? '#10b981' : device.stato === 'Riservato' ? '#f59e0b' : '#6b7280'}; border: 1px solid ${device.stato === 'Disponibile' ? '#10b98140' : device.stato === 'Riservato' ? '#f59e0b40' : '#6b728040'};">
                ${device.stato}
              </span>
            </span>
          </div>
        </div>
        <div class="device-card-footer">
          <div class="device-price">€${device.prezzo.toFixed(2)}</div>
          <div class="device-actions">
            <button class="btn btn--secondary action-btn" onclick="app.changeDeviceStatus(${device.id})">
              ${device.stato === 'Disponibile' ? 'Riserva' : device.stato === 'Riservato' ? 'Vendi' : 'Ripristina'}
            </button>
            <button class="btn btn--outline action-btn" onclick="app.deleteRefurbishedDevice(${device.id})" style="color: var(--color-error);">
              Elimina
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  showAddRefurbishedModal() {
    document.getElementById('addRefurbishedForm').reset();
    this.openModal('addRefurbishedModal');
  },

  updateRefurbishedModels(deviceType) {
    const modelSelect = document.querySelector('select[name="refModel"]');
    const capacitySelect = document.querySelector('select[name="refCapacity"]');
    
    if (!modelSelect || !capacitySelect) return;

    const models = deviceData[deviceType] || [];
    modelSelect.innerHTML = '<option value="">Seleziona...</option>' + 
      models.map(model => `<option value="${model}">${model}</option>`).join('');

    const capacities = storageCapacity[deviceType] || [];
    capacitySelect.innerHTML = '<option value="">Seleziona...</option>' + 
      capacities.map(cap => `<option value="${cap}">${cap}</option>`).join('');
  },

  setupChoiceCards() {
    const groups = document.querySelectorAll('[data-choice-group]');
    if (!groups.length) return;

    groups.forEach(group => {
      const fieldName = group.getAttribute('data-choice-group');
      if (!fieldName) return;

      const hiddenInput = document.querySelector(`input[name="${fieldName}"]`);
      if (!hiddenInput) return;

      const cards = group.querySelectorAll('.choice-card');
      cards.forEach(card => {
        card.addEventListener('click', () => {
          cards.forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');

          const value = card.getAttribute('data-value');
          if (value != null) hiddenInput.value = value;
        });
      });
    });
  },

  addRefurbishedDevice() {
    const form = document.getElementById('addRefurbishedForm');
    const formData = new FormData(form);

    const accessories = [];
    formData.getAll('refAccessories').forEach(acc => accessories.push(acc));

    const device = {
      id: appState.refurbishedCounter++,
      tipo: formData.get('refType'),
      modello: formData.get('refModel'),
      capacita: formData.get('refCapacity'),
      colore: formData.get('refColor'),
      seriale: formData.get('refSerial'),
      grado: formData.get('refGrade'),
      batteria: parseInt(formData.get('refBattery')),
      accessori: accessories,
      prezzo: parseFloat(formData.get('refPrice')),
      stato: 'Disponibile',
      dataInserimento: new Date(),
      note: formData.get('refNotes') || ''
    };

    appState.refurbishedDevices.push(device);
    this.closeModal('addRefurbishedModal');
    this.showToast('Dispositivo ricondizionato aggiunto!', 'success');
    this.renderRefurbishedDevices();
  },

  changeDeviceStatus(deviceId) {
    const device = appState.refurbishedDevices.find(d => d.id === deviceId);
    if (!device) return;

    if (device.stato === 'Disponibile') {
      device.stato = 'Riservato';
    } else if (device.stato === 'Riservato') {
      device.stato = 'Venduto';
    } else {
      device.stato = 'Disponibile';
    }

    this.showToast(`Stato aggiornato: ${device.stato}`, 'success');
    this.renderRefurbishedDevices();
  },

  deleteRefurbishedDevice(deviceId) {
    if (!confirm('Sei sicuro di voler eliminare questo dispositivo?')) return;

    const index = appState.refurbishedDevices.findIndex(d => d.id === deviceId);
    if (index !== -1) {
      appState.refurbishedDevices.splice(index, 1);
      this.showToast('Dispositivo eliminato', 'success');
      this.renderRefurbishedDevices();
    }
  },

  // EVALUATION METHODS
  renderEvaluationsList() {
    const statusFilter = document.getElementById('evaluationStatusFilter')?.value || '';
    const searchQuery = document.getElementById('evaluationSearchInput')?.value.toLowerCase() || '';

    let filtered = appState.evaluations;

    if (statusFilter) filtered = filtered.filter(e => e.stato === statusFilter);
    if (searchQuery) {
      filtered = filtered.filter(e =>
        e.numero.toLowerCase().includes(searchQuery) ||
        `${e.cliente.nome} ${e.cliente.cognome}`.toLowerCase().includes(searchQuery)
      );
    }

    const tbody = document.getElementById('evaluationsTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--color-text-secondary);">Nessuna valutazione trovata</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(evaluation => {
      const statusColors = {
        'In Attesa': '#f59e0b',
        'Accettata': '#10b981',
        'Rifiutata': '#ef4444',
        'Completata': '#6b7280'
      };
      
      return `
        <tr>
          <td><strong>${evaluation.numero}</strong></td>
          <td>${this.formatDate(evaluation.data)}</td>
          <td>${evaluation.cliente.nome} ${evaluation.cliente.cognome}</td>
          <td>${evaluation.dispositivo.tipo} ${evaluation.dispositivo.modello}</td>
          <td><strong style="color: var(--color-primary);">€${evaluation.prezzoOfferto.toFixed(2)}</strong></td>
          <td>
            <span class="status-badge" style="background: ${statusColors[evaluation.stato]}20; color: ${statusColors[evaluation.stato]}; border: 1px solid ${statusColors[evaluation.stato]}40;">
              ${evaluation.stato}
            </span>
          </td>
          <td>
            <button class="btn btn--secondary action-btn" onclick="app.viewEvaluation(${evaluation.id})">
              Dettagli
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  startNewEvaluation() {
    appState.currentEvalStep = 1;
    appState.currentEvaluation = {};
    const evalForm = document.getElementById('evaluationForm');
    if (evalForm) {
      evalForm.reset();
    }
    this.showPage('new-evaluation');
    // Dopo aver mostrato la pagina, assicuriamoci che gli step siano aggiornati
    setTimeout(() => {
      this.updateEvalSteps();
      this.setupChoiceCards();
    }, 0);
  },

  updateEvalSteps() {
    document.querySelectorAll('#evaluationSteps .step').forEach((step, index) => {
      const stepNum = index + 1;
      step.classList.remove('active', 'completed');
      if (stepNum === appState.currentEvalStep) {
        step.classList.add('active');
      } else if (stepNum < appState.currentEvalStep) {
        step.classList.add('completed');
      }
    });

    document.querySelectorAll('#evaluationForm .form-step').forEach((step, index) => {
      const stepNum = index + 1;
      step.classList.remove('active');
      if (stepNum === appState.currentEvalStep) {
        step.classList.add('active');
      }
    });

    // Con il nuovo flusso a 3 step:
    // Step 2: ricalcolo punteggi (estetico/funzionale/accessori)
    if (appState.currentEvalStep === 2) {
      setTimeout(() => this.calculateEvaluationScores(), 100);
    }

    // Step 3: calcolo prezzo + riepilogo
    if (appState.currentEvalStep === 3) {
      this.showEvaluationCalculation();
      this.showEvaluationSummary();
    }
  },

  nextEvalStep() {
    const currentStepElement = document.querySelector(`#evaluationForm .form-step[data-step="${appState.currentEvalStep}"]`);
    if (!currentStepElement) {
      console.warn('nextEvalStep: step corrente non trovato', appState.currentEvalStep);
      return;
    }

    const inputs = currentStepElement.querySelectorAll('input[required], select[required]');
    
    let isValid = true;
    inputs.forEach(input => {
      if (!input.value.trim()) {
        isValid = false;
        input.style.borderColor = 'var(--color-error)';
      } else {
        input.style.borderColor = '';
      }
    });

    if (!isValid) {
      this.showToast('Compila tutti i campi obbligatori', 'error');
      return;
    }

    if (appState.currentEvalStep < 6) {
      appState.currentEvalStep++;
      this.updateEvalSteps();
    }
  },

  prevEvalStep() {
    if (appState.currentEvalStep > 1) {
      appState.currentEvalStep--;
      this.updateEvalSteps();
    }
  },

  updateEvalModels(deviceType) {
    const modelSelect = document.querySelector('select[name="evalDeviceModel"]');
    const capacitySelect = document.querySelector('select[name="evalDeviceCapacity"]');
    
    if (!modelSelect || !capacitySelect) return;

    const models = deviceData[deviceType] || [];
    modelSelect.innerHTML = '<option value="">Seleziona...</option>' +
      models.map(model => `<option value="${model}">${model}</option>`).join('');

    const capacities = storageCapacity[deviceType] || [];
    capacitySelect.innerHTML = '<option value="">Seleziona...</option>' +
      capacities.map(cap => `<option value="${cap}">${cap}</option>`).join('');
  },

  calculateEvaluationScores() {
    const form = document.getElementById('evaluationForm');
    if (!form) return;

    const formData = new FormData(form);

    const model   = formData.get('evalDeviceModel') || '';
    const capacity = formData.get('evalDeviceCapacity') || '';
    const priceKey = `${model} ${capacity}`;
    const valoreBase = marketPrices[priceKey] || 0;

    // Mappa estetica da choice-card (Step 2) -> A/B/C/D
    const aestheticChoiceMap = {
      like_new:     'A',
      good:         'B',
      used:         'C',
      heavily_used: 'D'
    };
    const aestheticRaw = formData.get('evalAestheticOverall') || 'like_new';

    const engineInput = {
      modello:               model,
      memoriaGb:             capacity,
      valoreBase,
      batteriaSalutePercent: parseFloat(formData.get('evalBatteriaSalute')) || 0,
      cicliBatteria:         formData.get('evalCicliBatteria') ? parseInt(formData.get('evalCicliBatteria')) : null,
      statoEstetico:         aestheticChoiceMap[aestheticRaw] || 'B',
      faceIdOk:              formData.get('evalFaceIdOk') === '1',
      trueToneOk:            formData.get('evalTrueToneOk') === '1',
      displayOriginale:      formData.get('evalDisplayOriginale') === '1',
      touchOk:               formData.get('evalTouchOk') === '1',
      fotocamereOk:          formData.get('evalFotocamereOk') === '1',
      ricaricaOk:            formData.get('evalRicaricaOk') === '1',
      audioOk:               formData.get('evalAudioOk') === '1',
      microfonoOk:           formData.get('evalMicrofonoOk') === '1',
      reteOk:                formData.get('evalReteOk') === '1',
      imeiBlacklist:         formData.get('evalImeiBlacklist') === '1',
      activationLock:        formData.get('evalActivationLock') === '1',
      rateNonPagate:         formData.get('evalRateNonPagate') === '1',
      costoRipristinoStimato: parseFloat(formData.get('evalCostoRipristino')) || 0,
      margineMinimo:         parseFloat(formData.get('evalMargineMinimo')) || 30,
      modalitaValutazione:   formData.get('evalModalitaValutazione') || 'RITIRO'
    };

    const engineResult = valutaIphone(engineInput);

    appState.currentEvaluation = {
      ...(appState.currentEvaluation || {}),
      engineInput,
      engineResult,
      calculatedPrice: engineResult.valoreFinale
    };
  },

  showEvaluationCalculation() {
    const calcDiv = document.getElementById('evaluationCalculation');
    if (!calcDiv) return;

    const ev = appState.currentEvaluation;
    if (!ev || !ev.engineResult) {
      calcDiv.innerHTML = '<p style="color:var(--color-text-secondary)">Dati non disponibili. Torna al passo 1.</p>';
      return;
    }

    const r = ev.engineResult;
    const inp = ev.engineInput;
    const c = r.coefficienti;

    const esitoColors = {
      RITIRO_OK:       { bg: '#d1fae5', color: '#065f46', label: '✅ Ritiro consigliato' },
      SOLO_RICAMBI:    { bg: '#fef3c7', color: '#92400e', label: '🔧 Solo per ricambi' },
      NON_CONVENIENTE: { bg: '#fef3c7', color: '#92400e', label: '⚠️ Margine insufficiente — valutazione comunque effettuabile' },
      RIFIUTATO:       { bg: '#fecaca', color: '#7f1d1d', label: '🚫 Rifiutato' },
      DA_VALUTARE:     { bg: '#e0e7ff', color: '#3730a3', label: '⏳ Da valutare' }
    };
    const esito = esitoColors[r.esito] || esitoColors.DA_VALUTARE;

    const alertsHtml = r.alert.length
      ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:12px;">
           <strong style="color:#92400e;">⚠️ Alert</strong>
           <ul style="margin:6px 0 0 16px;color:#92400e;">${r.alert.map(a => `<li>${a}</li>`).join('')}</ul>
         </div>`
      : '';

    const noteHtml = r.note.length
      ? `<div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;margin-bottom:12px;">
           <strong style="color:#475569;">📋 Note tecniche</strong>
           <ul style="margin:6px 0 0 16px;color:#475569;">${r.note.map(n => `<li>${n}</li>`).join('')}</ul>
         </div>`
      : '';

    calcDiv.innerHTML = `
      <div style="background:${esito.bg};border-radius:10px;padding:12px 16px;margin-bottom:16px;text-align:center;">
        <span style="font-size:1.1rem;font-weight:700;color:${esito.color};">${esito.label}</span>
      </div>

      ${alertsHtml}${noteHtml}

      <div class="price-calculation">
        <div class="calculation-row">
          <span class="calculation-label">Valore base di mercato:</span>
          <span class="calculation-value">€${(inp.valoreBase || 0).toFixed(2)}</span>
        </div>
        <div class="calculation-row">
          <span class="calculation-label">Coeff. estetica (${inp.statoEstetico}):</span>
          <span class="calculation-value">${((c.estetica || 1) * 100).toFixed(0)}%</span>
        </div>
        <div class="calculation-row">
          <span class="calculation-label">Coeff. batteria (${inp.batteriaSalutePercent}%):</span>
          <span class="calculation-value">${((c.batteria || 1) * 100).toFixed(0)}%</span>
        </div>
        <div class="calculation-row">
          <span class="calculation-label">Coeff. funzionale:</span>
          <span class="calculation-value">${((c.funzionale || 1) * 100).toFixed(0)}%</span>
        </div>
        <div class="calculation-row">
          <span class="calculation-label">Valore lordo:</span>
          <span class="calculation-value">€${r.valoreLordo.toFixed(2)}</span>
        </div>
        <div class="calculation-row">
          <span class="calculation-label">- Costo ripristino:</span>
          <span class="calculation-value">- €${(inp.costoRipristinoStimato || 0).toFixed(2)}</span>
        </div>
        <div class="calculation-row">
          <span class="calculation-label">- Margine minimo:</span>
          <span class="calculation-value">- €${(inp.margineMinimo || 0).toFixed(2)}</span>
        </div>
        ${c.penaleAdmin > 0 ? `
        <div class="calculation-row">
          <span class="calculation-label">- Penale amministrativa (15%):</span>
          <span class="calculation-value" style="color:#ef4444;">- €${c.penaleAdmin.toFixed(2)}</span>
        </div>` : ''}
        <div class="calculation-row" style="border-top:2px solid var(--color-border);margin-top:8px;padding-top:10px;font-size:1.1rem;">
          <span class="calculation-label"><strong>Proposta di acquisto:</strong></span>
          <span class="calculation-value" id="finalOfferPrice" style="color:var(--color-emerald-600);font-weight:700;">€${r.valoreFinale.toFixed(2)}</span>
        </div>
        ${r.valoreRicambi > 0 ? `
        <div class="calculation-row">
          <span class="calculation-label">Valore stimato ricambi:</span>
          <span class="calculation-value">€${r.valoreRicambi.toFixed(2)}</span>
        </div>` : ''}
      </div>
    `;

    appState.currentEvaluation.calculatedPrice = r.valoreFinale;

    const priceAdjustmentInput = document.getElementById('priceAdjustment');
    const adjustmentValueSpan = document.getElementById('adjustmentValue');
    if (priceAdjustmentInput && adjustmentValueSpan) {
      priceAdjustmentInput.value = 0;
      adjustmentValueSpan.textContent = '0%';
    }

    const offerInput = document.getElementById('evalPrezzoOfferto');
    if (offerInput && !offerInput.value) {
      offerInput.value = r.valoreFinale > 0 ? r.valoreFinale : '';
    }
  },

  updateEvaluationPrice() {
    const slider = document.getElementById('priceAdjustment');
    const label = document.getElementById('adjustmentValue');
    const finalPriceEl = document.getElementById('finalOfferPrice');

    if (!slider || !label || !finalPriceEl) return;

    const adjustment = parseInt(slider.value) || 0;
    label.textContent = `${adjustment}%`;

    const baseOffer = appState.currentEvaluation?.calculatedPrice || 0;
    let adjustedPrice = baseOffer * (1 + adjustment / 100);
    const step = 5;
    adjustedPrice = Math.round(adjustedPrice / step) * step;

    finalPriceEl.textContent = `€${adjustedPrice.toFixed(2)}`;
    appState.currentEvaluation.adjustedPrice = adjustedPrice;

    const offerInput = document.getElementById('evalPrezzoOfferto');
    if (offerInput) offerInput.value = adjustedPrice;
  },

  saveEvaluation() {
    const form = document.getElementById('evaluationForm');
    const formData = new FormData(form);

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const evalNumber = `VAL-${dateStr}-${String(appState.evaluationCounter).padStart(3, '0')}`;

    const manualOffer = parseFloat(formData.get('evalPrezzoOfferto'));
    const finalPrice = (!isNaN(manualOffer) && manualOffer >= 0)
      ? manualOffer
      : (appState.currentEvaluation.adjustedPrice || appState.currentEvaluation.calculatedPrice || 0);

    const evaluation = {
      id: appState.evaluationCounter++,
      numero: evalNumber,
      data: today,
      cliente: {
        nome: formData.get('evalCustomerName'),
        cognome: formData.get('evalCustomerSurname'),
        telefono: formData.get('evalCustomerPhone'),
        email: formData.get('evalCustomerEmail') || ''
      },
      dispositivo: {
        tipo: formData.get('evalDeviceType'),
        modello: formData.get('evalDeviceModel'),
        capacita: formData.get('evalDeviceCapacity'),
        colore: formData.get('evalDeviceColor'),
        seriale: formData.get('evalDeviceSerial')
      },
      batteriaSalute: appState.currentEvaluation.engineInput?.batteriaSalutePercent ?? null,
      prezzoOfferto: finalPrice ?? 0,
      esito: appState.currentEvaluation.engineResult?.esito || 'DA_VALUTARE',
      coefficienti: appState.currentEvaluation.engineResult?.coefficienti || {},
      noteMotivazione: appState.currentEvaluation.engineResult?.note || [],
      alertMotivazione: appState.currentEvaluation.engineResult?.alert || [],
      stato: 'In Attesa',
      note: formData.get('evalNotes') || ''
    };

    evaluation.docTipo          = formData.get('evalDocTipo') || '';
    evaluation.docNumero        = formData.get('evalDocNumero') || '';
    evaluation.docRilasciatoDa  = formData.get('evalDocRilasciatoDa') || '';
    evaluation.venditoreNascita = formData.get('evalVenditoreNascita') || '';
    evaluation.venditoreIndirizzo = formData.get('evalVenditoreIndirizzo') || '';

    appState.evaluations.push(evaluation);
    appState.currentEvaluation._saved = evaluation;

    const esito = evaluation.esito;
    if (esito !== 'RIFIUTATO') {
      this.showToast(`Valutazione ${evalNumber} creata. Apertura dichiarazione...`, 'success');
      setTimeout(() => this.printDichiarazioneVendita(evaluation), 400);
    } else {
      this.showToast(`Valutazione ${evalNumber} salvata (rifiutata).`, 'info');
      this.showPage('evaluations');
    }
  },

  printDichiarazioneVendita(evaluation) {
    const s = appState.settings;
    const c = evaluation.cliente;
    const d = evaluation.dispositivo;
    const oggi = new Date(evaluation.data);
    const dataStr = oggi.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
    const prezzoTesto = `€ ${(evaluation.prezzoOfferto || 0).toFixed(2)}`;
    const prezzoLettere = (evaluation.prezzoOfferto || 0) % 1 === 0
      ? `(${(evaluation.prezzoOfferto || 0).toFixed(0)}/00)` : '';

    const html = `
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Dichiarazione di Vendita ${evaluation.numero}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; color: #111; margin: 0; padding: 32px 48px; }
  h1 { font-size: 17pt; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 10pt; color: #555; margin-bottom: 32px; }
  .header-row { display: flex; justify-content: space-between; margin-bottom: 28px; }
  .company-block { font-size: 10pt; line-height: 1.6; }
  .doc-ref { font-size: 10pt; text-align: right; line-height: 1.8; }
  .section { margin-bottom: 20px; }
  .section-title { font-weight: bold; border-bottom: 1.5px solid #111; padding-bottom: 3px; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f0f0f0; border: 1px solid #bbb; padding: 6px 10px; text-align: left; font-size: 10pt; }
  td { border: 1px solid #bbb; padding: 6px 10px; font-size: 10pt; }
  .price-box { text-align: center; border: 2px solid #111; border-radius: 6px; padding: 14px; margin: 24px 0; }
  .price-box .label { font-size: 11pt; margin-bottom: 6px; }
  .price-box .amount { font-size: 22pt; font-weight: bold; }
  .clauses { font-size: 10pt; line-height: 1.8; margin-bottom: 24px; }
  .clauses ol { margin: 0; padding-left: 18px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 48px; }
  .sig-block { width: 42%; }
  .sig-line { border-top: 1.5px solid #111; margin-top: 40px; padding-top: 4px; font-size: 10pt; text-align: center; }
  .footer { text-align: center; font-size: 9pt; color: #777; margin-top: 40px; border-top: 1px solid #ccc; padding-top: 10px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>

<div class="header-row">
  <div class="company-block">
    <strong>${s.companyName || 'Fixit Repair Express'}</strong><br>
    ${s.companyAddress || ''}<br>
    Tel: ${s.companyPhone || ''}<br>
    P.IVA: ${s.companyVat || ''}
  </div>
  <div class="doc-ref">
    <strong>N. ${evaluation.numero}</strong><br>
    Data: ${dataStr}
  </div>
</div>

<h1>DICHIARAZIONE DI VENDITA</h1>
<p class="subtitle">Il sottoscritto dichiara di cedere a titolo definitivo il dispositivo di seguito descritto</p>

<div class="section">
  <div class="section-title">Dati Venditore</div>
  <table>
    <tr><th>Cognome e Nome</th><td>${c.cognome || ''} ${c.nome || ''}</td><th>Telefono</th><td>${c.telefono || ''}</td></tr>
    <tr><th>Data di nascita</th><td>${evaluation.venditoreNascita ? new Date(evaluation.venditoreNascita).toLocaleDateString('it-IT') : '_______________'}</td><th>Indirizzo</th><td>${evaluation.venditoreIndirizzo || '_______________'}</td></tr>
    <tr><th>Tipo documento</th><td>${evaluation.docTipo || '_______________'}</td><th>N. documento</th><td>${evaluation.docNumero || '_______________'}</td></tr>
    <tr><th>Rilasciato da</th><td colspan="3">${evaluation.docRilasciatoDa || '_______________'}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">Dispositivo Ceduto</div>
  <table>
    <tr><th>Tipo</th><td>${d.tipo || ''}</td><th>Modello</th><td>${d.modello || ''}</td></tr>
    <tr><th>Capacità</th><td>${d.capacita || ''}</td><th>Colore</th><td>${d.colore || '—'}</td></tr>
    <tr><th>Seriale / IMEI</th><td colspan="3"><strong>${d.seriale || '_______________'}</strong></td></tr>
  </table>
</div>

<div class="price-box">
  <div class="label">Corrispettivo pattuito</div>
  <div class="amount">${prezzoTesto}</div>
  ${prezzoLettere ? `<div style="font-size:10pt;margin-top:4px;">${prezzoLettere}</div>` : ''}
</div>

<div class="section">
  <div class="section-title">Dichiarazioni del Venditore</div>
  <div class="clauses">
    <ol>
      <li>Il sottoscritto dichiara di essere il legittimo proprietario del dispositivo sopra indicato e di avere il pieno diritto di venderlo.</li>
      <li>Il dispositivo è libero da vincoli, pegni, sequestri, finanziamenti non saldati o qualsiasi altro onere reale.</li>
      <li>Il dispositivo non risulta segnalato come rubato né è presente in blacklist IMEI.</li>
      <li>L'Activation Lock (FMI) è stato disattivato prima della consegna.</li>
      <li>Il sottoscritto solleva ${s.companyName || 'Fixit Repair Express'} da qualsiasi responsabilità derivante da false dichiarazioni rese in questo documento.</li>
      <li>Il corrispettivo è stato ricevuto per intero in contanti / bonifico / altro al momento della firma.</li>
    </ol>
  </div>
</div>

<div class="signatures">
  <div class="sig-block">
    <div class="sig-line">Firma del Venditore</div>
  </div>
  <div class="sig-block">
    <div class="sig-line">Firma dell'Acquirente (${s.companyName || 'Fixit Repair Express'})</div>
  </div>
</div>

<div class="footer">
  Documento generato da ${s.companyName || 'Fixit Repair Express'} &mdash; ${evaluation.numero} &mdash; ${dataStr}
</div>

</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { this.showToast('Abilita i popup per stampare la dichiarazione', 'error'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);

    this.showPage('evaluations');
  },

  viewEvaluation(evaluationId) {
    const evaluation = appState.evaluations.find(e => e.id === evaluationId);
    if (!evaluation) return;

    alert(`Dettagli valutazione ${evaluation.numero}\n\nCliente: ${evaluation.cliente.nome} ${evaluation.cliente.cognome}\nDispositivo: ${evaluation.dispositivo.modello}\nOfferta: €${evaluation.prezzoOfferto.toFixed(2)}\nStato: ${evaluation.stato}`);
  },

  createInvoiceFromOrder() {
    if (!appState.currentOrder) return;
    
    this.showPage('new-invoice');
    
    // Wait for page to render
    setTimeout(() => {
      const order = appState.currentOrder;
      
      // Set client if exists
      const clientSelect = document.getElementById('invoiceClientSelect');
      const clientPhone = order.customer.phone;
      if (clientSelect) {
        const option = Array.from(clientSelect.options).find(opt => opt.value === clientPhone);
        if (option) {
          clientSelect.value = clientPhone;
        }
      }
      
      // Clear and add items from order
      if (order.quote && order.quote.items) {
        appState.invoiceItems = [];
        document.getElementById('invoiceItemsContainer').innerHTML = '';
        
        order.quote.items.forEach(item => {
          this.addInvoiceItem();
          const container = document.getElementById('invoiceItemsContainer');
          const lastItem = container.lastElementChild;
          lastItem.querySelector('[data-field="descrizione"]').value = item.partName;
          lastItem.querySelector('[data-field="quantita"]').value = item.quantity;
          lastItem.querySelector('[data-field="prezzoUnitario"]').value = item.price;
        });
        
        if (order.quote.labor > 0) {
          this.addInvoiceItem();
          const container = document.getElementById('invoiceItemsContainer');
          const lastItem = container.lastElementChild;
          lastItem.querySelector('[data-field="descrizione"]').value = `Manodopera tecnica (${order.quote.labor}h)`;
          lastItem.querySelector('[data-field="quantita"]').value = 1;
          lastItem.querySelector('[data-field="prezzoUnitario"]').value = order.quote.labor * appState.settings.laborCost;
        }
        
        this.updateInvoiceTotals();
      }
      
      this.showToast('Dati importati da ordine ' + order.number, 'success');
    }, 100);
  },

  createReceiptFromOrder() {
    if (!appState.currentOrder) return;
    
    this.showPage('new-receipt');
    
    setTimeout(() => {
      const order = appState.currentOrder;
      
      // Set client name
      const clientInput = document.querySelector('[name="receiptClient"]');
      if (clientInput) {
        clientInput.value = `${order.customer.name} ${order.customer.surname}`;
      }
      
      // Clear and add items
      if (order.quote && order.quote.items) {
        appState.receiptItems = [];
        document.getElementById('receiptItemsContainer').innerHTML = '';
        
        order.quote.items.forEach(item => {
          this.addReceiptItem();
          const container = document.getElementById('receiptItemsContainer');
          const lastItem = container.lastElementChild;
          lastItem.querySelector('[data-field="descrizione"]').value = item.partName;
          lastItem.querySelector('[data-field="quantita"]').value = item.quantity;
          const totalWithVat = (item.price * item.quantity) * 1.22;
          lastItem.querySelector('[data-field="prezzoTotale"]').value = totalWithVat.toFixed(2);
        });
      
      if (order.quote.labor > 0) {
        this.addInvoiceItem();
        const container = document.getElementById('invoiceItemsContainer');
        const lastItem = container.lastElementChild;
        lastItem.querySelector('[data-field="descrizione"]').value = `Manodopera tecnica (${order.quote.labor}h)`;
        lastItem.querySelector('[data-field="quantita"]').value = 1;
        lastItem.querySelector('[data-field="prezzoUnitario"]').value = order.quote.labor * appState.settings.laborCost;
      }
      
      this.updateInvoiceTotals();
    }
    
    this.showToast('Dati importati da ordine ' + order.number, 'success');
  }, 100);
},

createReceiptFromOrder() {
  if (!appState.currentOrder) return;
  
  this.showPage('new-receipt');
  
  setTimeout(() => {
    const order = appState.currentOrder;
    
    // Set client name
    const clientInput = document.querySelector('[name="receiptClient"]');
    if (clientInput) {
      clientInput.value = `${order.customer.name} ${order.customer.surname}`;
    }
    
    // Clear and add items
    if (order.quote && order.quote.items) {
      appState.receiptItems = [];
      document.getElementById('receiptItemsContainer').innerHTML = '';
      
      order.quote.items.forEach(item => {
        this.addReceiptItem();
        const container = document.getElementById('receiptItemsContainer');
        const lastItem = container.lastElementChild;
        lastItem.querySelector('[data-field="descrizione"]').value = item.partName;
        lastItem.querySelector('[data-field="quantita"]').value = item.quantity;
        const totalWithVat = (item.price * item.quantity) * 1.22;
        lastItem.querySelector('[data-field="prezzoTotale"]').value = totalWithVat.toFixed(2);
      });
      
      if (order.quote.labor > 0) {
        this.addReceiptItem();
        const container = document.getElementById('receiptItemsContainer');
        const lastItem = container.lastElementChild;
        lastItem.querySelector('[data-field="descrizione"]').value = `Manodopera (${order.quote.labor}h)`;
        lastItem.querySelector('[data-field="quantita"]').value = 1;
        const laborTotal = (order.quote.labor * appState.settings.laborCost) * 1.22;
        lastItem.querySelector('[data-field="prezzoTotale"]').value = laborTotal.toFixed(2);
      }
      
      this.updateReceiptTotal();
    }
  }, 100);
},

  // Navigazione tramite menu hamburger full-screen
  setupAppsMenuNavigation() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const appsMenu = document.getElementById('appsMenu');
    if (!hamburgerBtn || !appsMenu) return;

    // Toggle apertura/chiusura menu
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = appsMenu.classList.contains('open');
      if (isOpen) {
        appsMenu.classList.remove('open');
        appsMenu.setAttribute('aria-hidden', 'true');
        hamburgerBtn.classList.remove('is-open');
      } else {
        appsMenu.classList.add('open');
        appsMenu.setAttribute('aria-hidden', 'false');
        hamburgerBtn.classList.add('is-open');
      }
    });

    // Click sulle voci testuali del menu per cambiare pagina
    appsMenu.querySelectorAll('.menu-link').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();

        const pageName = item.dataset.page;
        if (!pageName) return;

        // Aggiorna stato attivo nel menu
        appsMenu.querySelectorAll('.menu-link').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Mostra la pagina
        this.showPage(pageName);

        // Chiudi il menu dopo la selezione
        appsMenu.classList.remove('open');
        appsMenu.setAttribute('aria-hidden', 'true');
        hamburgerBtn.classList.remove('is-open');
      });
    });
  }
};

// Initialize login/session handling when DOM is ready
const bootApp = () => {
  // Se esiste una sessione valida, entro direttamente nel gestionale
  const restored = app.restoreSessionIfValid();
  if (!restored) {
    // Nessuna sessione o scaduta: mostro schermata di login
    app.handleLogin();
  }
  // Inizializza il menu hamburger full-screen
  setTimeout(() => {
    app.setupAppsMenuNavigation();
  }, 100);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
