/**
 * @file lib/i18n.ts
 * @description Internationalisation (i18n) translation dictionary for the Wealth Portfolio Tracker.
 *
 * Supported Locales:
 *  - en  — English  (LTR, default)
 *  - ar  — Arabic   (RTL, added for Arabic-speaking users)
 *
 * Design Decisions:
 * - A flat key→string record per locale keeps the structure simple and avoids runtime overhead
 *   from heavy i18n libraries (no next-intl, react-i18next dependency needed for a single-page app).
 * - Locale state is persisted in localStorage so the user's choice survives page refreshes.
 * - The `dir` export maps each locale to its CSS writing-mode direction ('ltr' | 'rtl').
 */

export type Locale = 'en' | 'ar';

export type TranslationKey = keyof typeof translations.en;

export const translations = {
  en: {
    // ── App shell ────────────────────────────────────────────────────────────
    appTitle: 'Wealth Portfolio Tracker',
    appSubtitle: 'Talent Syria Technical Assessment',

    // ── Theme toggle ─────────────────────────────────────────────────────────
    switchToDark: 'Switch to Dark Mode',
    switchToLight: 'Switch to Light Mode',

    // ── Language toggle ───────────────────────────────────────────────────────
    switchLang: 'عربي',

    // ── Persona switcher ─────────────────────────────────────────────────────
    switchPersona: 'Switch Persona:',

    // ── Loading / error ───────────────────────────────────────────────────────
    loadingTitle: 'Loading Wealth Portfolio...',
    loadingDesc: 'Verifying authenticated role and calculating holdings...',
    errorTitle: 'Error Loading Portfolio',
    errorNoData: 'No portfolio data available',
    retry: 'Retry',

    // ── Demo banner ───────────────────────────────────────────────────────────
    demoBannerText: 'Deterministic Demo Dataset:',
    demoBannerDesc: 'Valuations use exact decimal average-cost accounting. Role-based access control is enforced at the database policy layer.',
    pricesAsOf: 'Prices as of:',
    refreshPrices: 'Refresh Prices',
    updating: 'Updating...',

    // ── Metrics cards ─────────────────────────────────────────────────────────
    totalNetWorth: 'Total Net Worth',
    baseCurrency: 'Base Currency:',
    totalCostBasis: 'Total Cost Basis',
    cumulativeCapital: 'Cumulative invested capital',
    unrealizedGainLoss: 'Unrealized Gain / Loss',
    returnOnCapital: 'return on invested capital',
    liquidCash: 'Liquid Cash Reserves',
    availableForDeployment: 'Available for deployment',

    // ── Allocation section ────────────────────────────────────────────────────
    assetAllocation: 'Asset Allocation',
    categorizedByClass: 'Categorized by asset class',
    stocks: 'Stocks',
    crypto: 'Crypto',
    realEstate: 'Real Estate',
    cash: 'Cash',

    // ── Holdings table ────────────────────────────────────────────────────────
    holdingsProjection: 'Holdings Projection',
    viewerMode: 'Viewer mode (Read-only)',
    recordTransaction: 'Record Transaction',
    asset: 'Asset',
    class: 'Class',
    quantity: 'Quantity',
    costBasis: 'Cost Basis',
    marketPrice: 'Market Price',
    marketValue: 'Market Value',
    gainLoss: 'Gain / Loss',

    // ── Ledger table ──────────────────────────────────────────────────────────
    appendOnlyLedger: 'Append-Only Ledger',
    immutableLedger: 'Immutable Ledger',
    date: 'Date',
    type: 'Type',
    unitPrice: 'Unit Price',
    fee: 'Fee',
    total: 'Total',

    // ── AI Assistant ──────────────────────────────────────────────────────────
    aiAssistant: 'AI Portfolio Assistant',
    boundBy: 'Bound by:',
    policies: 'policies',
    initMessage: 'Hello! I am your portfolio assistant. I can summarize your portfolio, analyze holdings and asset allocation, compute rebalancing targets, and prepare transaction proposals for your review.',
    thinking: 'Thinking & querying portfolio tools...',
    askReadOnly: 'Ask portfolio questions (read-only)...',
    askWritable: 'Ask questions or propose trades...',
    chipSummary: '📊 Summary',
    chipHoldings: '📈 Holdings',
    chipRebalance: '⚖️ Rebalance',
    chipPropose: '💡 Propose AAPL Trade',
    chipSummaryPrompt: 'Summarize my portfolio',
    chipHoldingsPrompt: 'Show my current holdings',
    chipRebalancePrompt: 'Suggest rebalancing my portfolio',
    chipProposePrompt: 'Propose buying 5 shares of AAPL at 230',

    // ── Proposal card ─────────────────────────────────────────────────────────
    pendingProposal: 'Pending Transaction Proposal',
    requiresApproval: 'Requires Approval',
    proposalAsset: 'ASSET',
    proposalAction: 'ACTION',
    proposalQuantity: 'QUANTITY',
    proposalUnitPrice: 'UNIT PRICE',
    proposalTotal: 'ESTIMATED TOTAL',
    confirmTransaction: 'Confirm Transaction',
    cancel: 'Cancel',
    confirmed: '✓ Transaction Confirmed & Persisted',
    discarded: '✕ Proposal Discarded',

    // ── Transaction modal ─────────────────────────────────────────────────────
    recordTxTitle: 'Record Transaction',
    txAsset: 'Asset',
    txType: 'Transaction Type',
    txQuantity: 'Quantity',
    txUnitPrice: 'Unit Price ($)',
    txFee: 'Fee ($)',
    txDate: 'Date',
    txCancel: 'Cancel',
    txCommit: 'Commit Transaction',
    txRecording: 'Recording...',

    // ── Alerts ────────────────────────────────────────────────────────────────
    switchedUser: 'Switched active user to',
    failedSwitch: 'Failed to switch user',
    pricesRefreshed: 'Market price snapshots refreshed with demo feed.',
    failedRefresh: 'Failed to refresh prices',
    txSuccess: 'Transaction recorded successfully:',
    txFailed: 'Transaction submission error',
    proposalCancelled: 'Proposal safely discarded. No changes made.',
    confirmSuccess: 'Proposal confirmed & executed:',
    confirmFailed: 'Confirmation failed',
  },

  ar: {
    // ── App shell ────────────────────────────────────────────────────────────
    appTitle: 'متتبع محفظة الثروة',
    appSubtitle: 'التقييم التقني لـ Talent Syria',

    // ── Theme toggle ─────────────────────────────────────────────────────────
    switchToDark: 'التبديل إلى الوضع المظلم',
    switchToLight: 'التبديل إلى الوضع المضيء',

    // ── Language toggle ───────────────────────────────────────────────────────
    switchLang: 'English',

    // ── Persona switcher ─────────────────────────────────────────────────────
    switchPersona: 'تبديل المستخدم:',

    // ── Loading / error ───────────────────────────────────────────────────────
    loadingTitle: 'جارٍ تحميل محفظة الثروة...',
    loadingDesc: 'جارٍ التحقق من الدور المُصادق عليه وحساب الحيازات...',
    errorTitle: 'خطأ في تحميل المحفظة',
    errorNoData: 'لا تتوفر بيانات محفظة',
    retry: 'إعادة المحاولة',

    // ── Demo banner ───────────────────────────────────────────────────────────
    demoBannerText: 'مجموعة بيانات تجريبية حتمية:',
    demoBannerDesc: 'تستخدم التقييمات محاسبة التكلفة المتوسطة بالعلامة العشرية الدقيقة. يتم تطبيق التحكم في الوصول القائم على الأدوار على مستوى سياسة قاعدة البيانات.',
    pricesAsOf: 'الأسعار اعتباراً من:',
    refreshPrices: 'تحديث الأسعار',
    updating: 'جارٍ التحديث...',

    // ── Metrics cards ─────────────────────────────────────────────────────────
    totalNetWorth: 'إجمالي صافي الثروة',
    baseCurrency: 'العملة الأساسية:',
    totalCostBasis: 'إجمالي أساس التكلفة',
    cumulativeCapital: 'رأس المال المستثمر التراكمي',
    unrealizedGainLoss: 'الأرباح / الخسائر غير المُحققة',
    returnOnCapital: 'العائد على رأس المال المستثمر',
    liquidCash: 'الاحتياطيات النقدية السائلة',
    availableForDeployment: 'متاح للنشر',

    // ── Allocation section ────────────────────────────────────────────────────
    assetAllocation: 'توزيع الأصول',
    categorizedByClass: 'مصنّفة حسب فئة الأصل',
    stocks: 'الأسهم',
    crypto: 'العملات الرقمية',
    realEstate: 'العقارات',
    cash: 'النقد',

    // ── Holdings table ────────────────────────────────────────────────────────
    holdingsProjection: 'توقعات الحيازات',
    viewerMode: 'وضع المشاهدة (قراءة فقط)',
    recordTransaction: 'تسجيل معاملة',
    asset: 'الأصل',
    class: 'الفئة',
    quantity: 'الكمية',
    costBasis: 'أساس التكلفة',
    marketPrice: 'سعر السوق',
    marketValue: 'القيمة السوقية',
    gainLoss: 'الأرباح / الخسائر',

    // ── Ledger table ──────────────────────────────────────────────────────────
    appendOnlyLedger: 'دفتر الأستاذ للإلحاق فقط',
    immutableLedger: 'دفتر الأستاذ الثابت',
    date: 'التاريخ',
    type: 'النوع',
    unitPrice: 'سعر الوحدة',
    fee: 'الرسوم',
    total: 'الإجمالي',

    // ── AI Assistant ──────────────────────────────────────────────────────────
    aiAssistant: 'مساعد المحفظة بالذكاء الاصطناعي',
    boundBy: 'مقيّد بـ:',
    policies: 'السياسات',
    initMessage: 'مرحباً! أنا مساعد محفظتك. يمكنني تلخيص محفظتك وتحليل الحيازات وتوزيع الأصول وحساب أهداف إعادة التوازن وإعداد مقترحات المعاملات لمراجعتك.',
    thinking: 'جارٍ التفكير والاستعلام عن أدوات المحفظة...',
    askReadOnly: 'اسأل عن المحفظة (قراءة فقط)...',
    askWritable: 'اطرح أسئلة أو اقترح صفقات...',
    chipSummary: '📊 ملخص',
    chipHoldings: '📈 الحيازات',
    chipRebalance: '⚖️ إعادة التوازن',
    chipPropose: '💡 اقتراح صفقة AAPL',
    chipSummaryPrompt: 'Summarize my portfolio',
    chipHoldingsPrompt: 'Show my current holdings',
    chipRebalancePrompt: 'Suggest rebalancing my portfolio',
    chipProposePrompt: 'Propose buying 5 shares of AAPL at 230',

    // ── Proposal card ─────────────────────────────────────────────────────────
    pendingProposal: 'مقترح معاملة معلّق',
    requiresApproval: 'يتطلب موافقة',
    proposalAsset: 'الأصل',
    proposalAction: 'الإجراء',
    proposalQuantity: 'الكمية',
    proposalUnitPrice: 'سعر الوحدة',
    proposalTotal: 'الإجمالي التقديري',
    confirmTransaction: 'تأكيد المعاملة',
    cancel: 'إلغاء',
    confirmed: '✓ تم تأكيد المعاملة وتخزينها',
    discarded: '✕ تم تجاهل المقترح',

    // ── Transaction modal ─────────────────────────────────────────────────────
    recordTxTitle: 'تسجيل معاملة',
    txAsset: 'الأصل',
    txType: 'نوع المعاملة',
    txQuantity: 'الكمية',
    txUnitPrice: 'سعر الوحدة ($)',
    txFee: 'الرسوم ($)',
    txDate: 'التاريخ',
    txCancel: 'إلغاء',
    txCommit: 'تأكيد المعاملة',
    txRecording: 'جارٍ التسجيل...',

    // ── Alerts ────────────────────────────────────────────────────────────────
    switchedUser: 'تم التبديل إلى المستخدم',
    failedSwitch: 'فشل التبديل بين المستخدمين',
    pricesRefreshed: 'تم تحديث لقطات أسعار السوق بالخلاصة التجريبية.',
    failedRefresh: 'فشل تحديث الأسعار',
    txSuccess: 'تم تسجيل المعاملة بنجاح:',
    txFailed: 'خطأ في إرسال المعاملة',
    proposalCancelled: 'تم تجاهل المقترح بأمان. لم تُجرَ أي تغييرات.',
    confirmSuccess: 'تم تأكيد المقترح وتنفيذه:',
    confirmFailed: 'فشل التأكيد',
  },
} as const;

/** Maps each locale to its HTML writing direction. */
export const dir: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ar: 'rtl',
};

/** Returns a typed translation accessor for the given locale. */
export function t(locale: Locale): (typeof translations)[Locale] {
  return translations[locale];
}
