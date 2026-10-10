/* global document, window */
const people = [
  {
    id: 'SUB-00001',
    name: 'Maria Santos',
    initials: 'MS',
    status: 'Active',
    services: 'Internet 50 · Cable Basic',
    balance: 1499,
    area: 'North District',
    contact: '0918 000 0001',
    overdue: false,
  },
  {
    id: 'SUB-00062',
    name: 'Imelda Corpuz',
    initials: 'IC',
    status: 'Needs follow-up',
    services: 'Cable Plus',
    balance: 750,
    area: 'South District',
    contact: '0918 000 0062',
    overdue: true,
  },
  {
    id: 'SUB-00028',
    name: 'Mark Alonzo',
    initials: 'MA',
    status: 'Needs follow-up',
    services: 'Combo 50',
    balance: 3198,
    area: 'North District',
    contact: '0918 000 0028',
    overdue: true,
  },
];
const roles = {
  cashier: {
    label: 'Cashier workspace',
    summary:
      'Start with the customer, then finish the payment with confidence.',
    hero: 'Receive a payment',
    description:
      'Find an account, check what is due, and review the allocation before posting.',
    action: 'Find a subscriber',
    target: 'wizard',
    value: '₱136,025',
    metric: 'collected this month',
    cards: [
      [
        '◎',
        '3 GCash payments await review',
        'Check proof and account details before verification.',
        'money',
      ],
      [
        '◷',
        'One customer needs a receipt',
        'A posted cash payment is ready to print.',
        'money',
      ],
      [
        '⌕',
        'Find the right account quickly',
        'Search by name or subscriber number.',
        'customers',
      ],
    ],
  },
  owner: {
    label: 'Owner workspace',
    summary: 'Business health and exceptions, with the source one click away.',
    hero: 'Keep October on track',
    description:
      'Review billed, collected, and overdue work before closing the month.',
    action: 'Review insights',
    target: 'insights',
    value: '₱68,604',
    metric: 'billed this month',
    cards: [
      [
        '◷',
        '51 accounts need follow-up',
        'Open the case queue by age and amount.',
        'field',
      ],
      [
        '▤',
        'October billing is finalized',
        'Review the run and posted invoices.',
        'money',
      ],
      [
        '✓',
        'Backup verified today',
        'Review the recovery point and system health.',
        'system',
      ],
    ],
  },
  supervisor: {
    label: 'Collection supervisor workspace',
    summary:
      'See field exceptions before they become reconciliation surprises.',
    hero: 'Resolve the next exception',
    description:
      'Follow the oldest cases and review batches that need remittance.',
    action: 'Open field work',
    target: 'field',
    value: '₱87,931',
    metric: 'overdue balance',
    cards: [
      [
        '◷',
        '3 suspension candidates',
        'Review the policy basis and account history.',
        'field',
      ],
      [
        '♧',
        '2 batches need reconciliation',
        'Compare collected and remitted amounts.',
        'field',
      ],
      [
        '◎',
        '51 accounts for follow-up',
        'Sort cases by consequence and age.',
        'field',
      ],
    ],
  },
  auditor: {
    label: 'Auditor workspace',
    summary: 'Trace every total to dated source records and corrections.',
    hero: 'Follow the evidence',
    description:
      'Start with a question, inspect its calculation, then open the records behind it.',
    action: 'Explore reports',
    target: 'insights',
    value: '₱146,440',
    metric: 'receivables as of 10 Oct',
    cards: [
      [
        '▥',
        'Billed versus collected',
        'Check the time basis before comparing totals.',
        'insights',
      ],
      [
        '◷',
        'Overdue aging',
        'See each age range and its source accounts.',
        'field',
      ],
      [
        '◎',
        'Corrections register',
        'Open linked records, actor, time and reason.',
        'insights',
      ],
    ],
  },
  technician: {
    label: 'Technician workspace',
    summary:
      'Locate the service and its history without crossing into finance work.',
    hero: 'Find the right connection',
    description:
      'Search a customer, confirm the service address, then open its status history.',
    action: 'Find a service',
    target: 'customers',
    value: '2',
    metric: 'services on sample account',
    cards: [
      [
        '⌕',
        'Find a subscriber',
        'Search by account, name or service number.',
        'customers',
      ],
      [
        '◫',
        'Review service history',
        'Open an account before changing its state.',
        'customers',
      ],
      [
        '◷',
        'Recent service activity',
        'Check what changed and when.',
        'customers',
      ],
    ],
  },
};
const $ = (id) => document.getElementById(id);
const money = (value) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value,
  );
let accountFilter = 'all';
let lastFocus = null;
let wizardStep = 0;
let wizardData = { personId: '', amount: '', method: 'Cash' };
function showView(view) {
  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.hidden = panel.id !== `view-${view}`;
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('crumbName').textContent = {
    today: 'Today',
    customers: 'Customers',
    money: 'Money',
    field: 'Field work',
    insights: 'Insights',
    system: 'System',
  }[view];
  closeMobile();
  window.scrollTo(0, 0);
}
function renderRole() {
  const role = $('roleSelect').value;
  const data = roles[role];
  const allowed = {
    cashier: ['today', 'customers', 'money'],
    owner: ['today', 'customers', 'money', 'field', 'insights', 'system'],
    supervisor: ['today', 'customers', 'field', 'insights'],
    auditor: ['today', 'customers', 'field', 'insights'],
    technician: ['today', 'customers'],
  }[role];
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.hidden = !allowed.includes(button.dataset.view);
  });
  const openView = document
    .querySelector('.view-panel:not([hidden])')
    ?.id.replace('view-', '');
  if (openView && !allowed.includes(openView)) showView('today');
  $('todayContext').textContent = data.label;
  $('todayDescription').textContent = data.summary;
  $('heroTitle').textContent = data.hero;
  $('heroDescription').textContent = data.description;
  $('heroAction').textContent = `${data.action} ↗`;
  $('heroAction').dataset.target = data.target;
  $('pulseValue').textContent = data.value;
  $('pulseLabel').textContent = data.metric;
  $('priorityGrid').innerHTML = data.cards
    .map(
      ([icon, title, note, target], index) =>
        `<button class="priority-card" data-target="${target}" type="button"><span class="card-symbol ${index === 1 ? 'amber' : index === 2 ? 'teal' : ''}">${icon}</span><strong>${title}</strong><small>${note}</small><span class="card-chevron" aria-hidden="true">↗</span></button>`,
    )
    .join('');
  $('recentWork').innerHTML =
    role === 'technician'
      ? '<div class="recent-row"><span class="recent-bullet"></span><span><strong>Maria Santos · Internet 50</strong><small>Service active · North District</small></span><b>Open ↗</b></div><div class="recent-row"><span class="recent-bullet amber"></span><span><strong>Imelda Corpuz · Cable Plus</strong><small>Service history available</small></span><b>Open ↗</b></div>'
      : '<div class="recent-row"><span class="recent-bullet"></span><span><strong>Maria Santos · GCash posted</strong><small>RCPT-005040 · Today</small></span><b>₱100</b></div><div class="recent-row"><span class="recent-bullet"></span><span><strong>Maria Santos · Cash posted</strong><small>RCPT-005039 · Today</small></span><b>₱20,000</b></div><div class="recent-row"><span class="recent-bullet amber"></span><span><strong>Imelda Corpuz · Follow-up</strong><small>Oldest unpaid · 15 July</small></span><b>₱750</b></div>';
  $('newSubscriber').hidden = role !== 'owner';
  $('moneyPayment').hidden =
    role === 'auditor' || role === 'technician' || role === 'supervisor';
  if (role === 'technician') accountFilter = 'all';
  document.querySelector('[data-filter="overdue"]').hidden =
    role === 'technician';
  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.classList.toggle('is-selected', chip.dataset.filter === accountFilter);
  });
  renderAccounts();
}
function renderAccounts() {
  const canSeeMoney = $('roleSelect').value !== 'technician';
  const query = $('accountSearch').value.trim().toLowerCase();
  const found = people.filter(
    (person) =>
      (accountFilter === 'all' ||
        (accountFilter === 'overdue' ? person.overdue : !person.overdue)) &&
      `${person.name} ${person.id} ${person.services}`
        .toLowerCase()
        .includes(query),
  );
  $('accountCount').textContent =
    `${found.length} ${found.length === 1 ? 'account' : 'accounts'}`;
  $('accountGrid').innerHTML = found.length
    ? found
        .map((person) => {
          const status = canSeeMoney ? person.status : 'Service active';
          return `<button class="account-card" data-person="${person.id}" type="button"><span class="account-top"><span class="account-avatar">${person.initials}</span><span class="status ${canSeeMoney && person.overdue ? 'warn' : ''}">${status}</span></span><strong>${person.name}</strong><small>${person.id} · ${person.services}</small><span class="account-bottom"><span>${canSeeMoney ? `<small>Outstanding</small><strong>${money(person.balance)}</strong>` : '<small>Service details</small><strong>Open profile</strong>'}</span><b>Open account ↗</b></span></button>`;
        })
        .join('')
    : '<div class="empty-state">No matching account. Check the name or subscriber number.</div>';
}
function openSheet(kind, id = '') {
  lastFocus = document.activeElement;
  if (kind === 'account') {
    const person = people.find((item) => item.id === id);
    if (!person) return;
    const role = $('roleSelect').value;
    const canSeeMoney = role !== 'technician';
    const canReceive = role === 'cashier' || role === 'owner';
    $('sheetEyebrow').textContent = 'Subscriber profile · prototype';
    $('sheetBody').innerHTML =
      `<div class="sheet-profile"><span class="account-avatar">${person.initials}</span><span><h2>${person.name}</h2><small>${person.id} · ${canSeeMoney ? person.status : 'Service active'}</small></span></div>${canSeeMoney ? `<div class="sheet-highlight"><small>Outstanding balance</small><strong>${money(person.balance)}</strong></div>` : ''}<dl class="detail-list"><div><dt>Services</dt><dd>${person.services}</dd></div><div><dt>Area</dt><dd>${person.area}</dd></div><div><dt>Contact</dt><dd>${person.contact}</dd></div></dl><p style="color:#718ba4;line-height:1.5">A complete profile would keep service, money, and history in focused task tabs. This prototype tests the entry and detail depth.</p>${canReceive ? `<button class="button button-primary sheet-action" data-sheet-action="payment" type="button">Receive payment for ${person.name.split(' ')[0]}</button>` : ''}`;
    $('sheetBody')
      .querySelector('[data-sheet-action]')
      ?.addEventListener('click', () => {
        closeSheet();
        openWizard(person.id);
      });
  } else {
    const content = {
      register: [
        'Record workspace',
        'A focused register opens after a summary or search. Production will load permission-safe data from the API.',
      ],
      verify: [
        'GCash verification',
        'A verification card would show proof, reference, subscriber, amount, and explicit approve or reject controls.',
      ],
      billing: [
        'Billing run',
        'The new flow separates month selection, eligibility, draft review, and final posting.',
      ],
      plan: [
        'Register subscriber',
        'The proposed flow has four short steps: identity, contact/location, billing defaults, and review.',
      ],
      backups: [
        'Backup review',
        'Restore will be a guarded flow: choose, verify, review impact, then confirm.',
      ],
    }[kind] || [
      kind,
      'This navigation concept has a production flow in the implementation plan.',
    ];
    $('sheetEyebrow').textContent = 'Workflow preview';
    $('sheetBody').innerHTML =
      `<div class="sheet-profile"><span class="account-avatar">✦</span><span><h2>${content[0]}</h2><small>Concept only · no server action</small></span></div><div class="sheet-highlight"><small>Next design slice</small><p style="margin:0;line-height:1.5">${content[1]}</p></div><button class="button button-quiet sheet-action" id="sheetDone" type="button">Back to workspace</button>`;
    $('sheetDone').addEventListener('click', closeSheet);
  }
  $('sheetScrim').hidden = false;
  $('detailSheet').hidden = false;
  $('appShell').inert = true;
  document.querySelector('.prototype-banner').inert = true;
  $('sheetClose').focus();
}
function closeSheet() {
  $('sheetScrim').hidden = true;
  $('detailSheet').hidden = true;
  $('appShell').inert = false;
  document.querySelector('.prototype-banner').inert = false;
  lastFocus?.focus?.();
}
function openWizard(personId = '') {
  lastFocus = document.activeElement;
  wizardStep = personId ? 1 : 0;
  wizardData = { personId, amount: '', method: 'Cash' };
  $('wizardBackdrop').hidden = false;
  $('wizard').hidden = false;
  $('appShell').inert = true;
  document.querySelector('.prototype-banner').inert = true;
  renderWizard();
}
function closeWizard() {
  $('wizardBackdrop').hidden = true;
  $('wizard').hidden = true;
  $('appShell').inert = false;
  document.querySelector('.prototype-banner').inert = false;
  lastFocus?.focus?.();
}
function renderWizardAccounts() {
  const query = $('wizardAccountSearch').value.trim().toLowerCase();
  const found = people.filter((person) =>
    `${person.name} ${person.id}`.toLowerCase().includes(query),
  );
  $('wizardAccounts').innerHTML = found.length
    ? found
        .map(
          (person) =>
            `<button class="pick-account ${person.id === wizardData.personId ? 'is-selected' : ''}" data-pick="${person.id}" type="button"><span class="account-avatar">${person.initials}</span><span><strong>${person.name}</strong><small>${person.id} · ${money(person.balance)} outstanding</small></span><span class="pick-check">${person.id === wizardData.personId ? '✓' : '→'}</span></button>`,
        )
        .join('')
    : '<div class="empty-state">No match. Check the account number or spelling.</div>';
  $('wizardAccounts')
    .querySelectorAll('[data-pick]')
    .forEach((button) =>
      button.addEventListener('click', () => {
        wizardData.personId = button.dataset.pick;
        renderWizardAccounts();
        $('wizardNext').focus();
      }),
    );
}
function renderWizard() {
  const titles = [
    'Find the customer',
    'Enter payment details',
    'Review allocation',
    'Confirm payment',
    'Sample receipt ready',
  ];
  const subtitles = [
    'Confirm who this payment belongs to before entering an amount.',
    'Enter the amount and choose how the customer paid.',
    'See exactly where this amount would go.',
    'Check the customer, method, amount, and allocation one last time.',
    'This is a prototype result. No payment was posted or sent.',
  ];
  $('wizardCounter').textContent =
    wizardStep < 4 ? `Step ${wizardStep + 1} of 4` : 'Prototype result';
  $('wizardTitle').textContent = titles[wizardStep];
  $('wizardSubtitle').textContent = subtitles[wizardStep];
  $('wizardError').hidden = true;
  $('wizardProgress').innerHTML = [
    'Customer',
    'Payment',
    'Allocation',
    'Review',
  ]
    .map(
      (label, index) =>
        `<span class="progress-step ${index === wizardStep ? 'is-current' : ''} ${index < wizardStep ? 'is-done' : ''}"><span class="step-circle">${index < wizardStep || wizardStep === 4 ? '✓' : index + 1}</span>${label}</span>`,
    )
    .join('');
  $('wizardBack').hidden = wizardStep === 0 || wizardStep === 4;
  $('wizardNext').textContent = [
    'Continue',
    'Preview allocation',
    'Continue to review',
    `Post sample ${money(Number(wizardData.amount) || 0)} payment`,
    'Close',
  ][wizardStep];
  if (wizardStep === 0) {
    $('wizardStepContent').innerHTML =
      '<div class="field"><label for="wizardAccountSearch">Search subscribers</label><input id="wizardAccountSearch" type="search" placeholder="Name or account number" autocomplete="off" /><span class="field-hint">Choose the account that matches the person paying.</span></div><div class="pick-list" id="wizardAccounts"></div>';
    $('wizardAccountSearch').addEventListener('input', renderWizardAccounts);
    renderWizardAccounts();
    $('wizardAccountSearch').focus();
  } else if (wizardStep === 1) {
    const person = people.find((item) => item.id === wizardData.personId);
    $('wizardStepContent').innerHTML =
      `<div class="selected-customer"><span class="account-avatar">${person.initials}</span><span><strong>${person.name}</strong><small>${person.id} · ${money(person.balance)} outstanding</small></span></div><div class="field"><label for="paymentAmount">Amount received (PHP)</label><input id="paymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" value="${wizardData.amount}" /><span class="field-hint">Example amount only. No data leaves this page.</span></div><div class="field"><label>Payment method</label><div class="method-grid">${['Cash', 'GCash', 'Bank transfer', 'Cheque'].map((method) => `<button class="method-choice ${wizardData.method === method ? 'is-selected' : ''}" data-method="${method}" type="button" aria-pressed="${wizardData.method === method}">${method}</button>`).join('')}</div></div><div id="methodExtra"></div>`;
    $('paymentAmount').addEventListener('input', (event) => {
      wizardData.amount = event.target.value;
    });
    $('wizardStepContent')
      .querySelectorAll('[data-method]')
      .forEach((button) =>
        button.addEventListener('click', () => {
          wizardData.method = button.dataset.method;
          renderWizard();
        }),
      );
    $('methodExtra').innerHTML =
      wizardData.method === 'GCash'
        ? '<p class="field-hint">GCash submissions enter verification before they appear as posted payments.</p>'
        : wizardData.method === 'Cheque'
          ? '<p class="field-hint">Cheque details and clearing status will be required in the production flow.</p>'
          : '';
    $('paymentAmount').focus();
  } else if (wizardStep === 2 || wizardStep === 3) {
    const person = people.find((item) => item.id === wizardData.personId),
      amount = Number(wizardData.amount),
      allocated = Math.min(amount, person.balance),
      credit = Math.max(0, amount - person.balance);
    $('wizardStepContent').innerHTML =
      `${wizardStep === 3 ? `<div class="selected-customer"><span class="account-avatar">${person.initials}</span><span><strong>${person.name}</strong><small>${person.id} · ${wizardData.method}</small></span></div>` : ''}<div class="allocation-card"><h3>Oldest eligible invoice first · illustrative preview</h3><div class="allocation-line"><span>October service balance</span><strong>${money(person.balance)}</strong></div><div class="allocation-line"><span>Applied to balance</span><strong>${money(allocated)}</strong></div><div class="allocation-line"><span>Remaining credit</span><strong>${money(credit)}</strong></div></div><div class="review-total"><span>${wizardStep === 3 ? 'Sample payment to post' : 'Amount received'}</span><strong>${money(amount)}</strong></div><p class="field-hint">The live system must recalculate allocation on the server at posting and stop if records changed.</p>`;
    $('wizardNext').focus();
  } else {
    const person = people.find((item) => item.id === wizardData.personId);
    $('wizardStepContent').innerHTML =
      `<div class="success-mark">✓</div><div class="allocation-card"><div class="allocation-line"><span>Customer</span><strong>${person.name}</strong></div><div class="allocation-line"><span>Sample amount</span><strong>${money(Number(wizardData.amount))}</strong></div><div class="allocation-line"><span>Method</span><strong>${wizardData.method}</strong></div><div class="allocation-line"><span>Reference</span><strong>PROTOTYPE-ONLY</strong></div></div><p class="field-hint">No receipt number was issued. Production posting will return the real receipt or pending verification status.</p>`;
    $('wizardNext').focus();
  }
}
function nextWizard() {
  if (wizardStep === 4) return closeWizard();
  if (wizardStep === 0 && !wizardData.personId)
    return wizardError('Choose a subscriber to continue.');
  if (wizardStep === 1 && !(Number(wizardData.amount) > 0))
    return wizardError('Enter an amount greater than zero.');
  wizardStep += 1;
  renderWizard();
}
function wizardError(message) {
  $('wizardError').textContent = message;
  $('wizardError').hidden = false;
  $('wizardError').scrollIntoView({ block: 'nearest' });
}
function closeMobile() {
  $('appShell').classList.remove('mobile-open');
  $('drawerScrim').hidden = true;
}
document.querySelectorAll('.nav-item').forEach((button) => {
  button.title = button.querySelector('.nav-text').textContent;
  button.addEventListener('click', () => showView(button.dataset.view));
});
document.querySelectorAll('[data-concept-choice]').forEach((button) =>
  button.addEventListener('click', () => {
    document.body.dataset.concept = button.dataset.conceptChoice;
    document.querySelectorAll('[data-concept-choice]').forEach((choice) => {
      choice.classList.toggle('is-selected', choice === button);
      choice.setAttribute('aria-pressed', String(choice === button));
    });
    $('appShell').classList.remove('is-collapsed');
    $('sidebarToggle').setAttribute(
      'aria-label',
      button.dataset.conceptChoice === 'rail'
        ? 'Expand sidebar'
        : 'Collapse sidebar',
    );
  }),
);
$('sidebarToggle').addEventListener('click', () => {
  $('appShell').classList.toggle('is-collapsed');
  const expanded =
    document.body.dataset.concept === 'rail'
      ? $('appShell').classList.contains('is-collapsed')
      : !$('appShell').classList.contains('is-collapsed');
  $('sidebarToggle').setAttribute(
    'aria-label',
    expanded ? 'Collapse sidebar' : 'Expand sidebar',
  );
  $('sidebarToggle').title = expanded ? 'Collapse sidebar' : 'Expand sidebar';
});
$('mobileMenu').addEventListener('click', () => {
  $('appShell').classList.add('mobile-open');
  $('drawerScrim').hidden = false;
  $('sidebarToggle').focus();
});
$('drawerScrim').addEventListener('click', closeMobile);
$('globalSearch').addEventListener('click', () => {
  showView('customers');
  $('accountSearch').focus();
});
document.addEventListener('keydown', (event) => {
  const modal = !$('wizard').hidden
    ? $('wizard')
    : !$('detailSheet').hidden
      ? $('detailSheet')
      : null;
  if (modal && event.key === 'Tab') {
    const controls = [
      ...modal.querySelectorAll(
        'button:not([hidden]):not(:disabled), input:not([hidden]), select:not([hidden])',
      ),
    ];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    if (modal) return;
    event.preventDefault();
    showView('customers');
    $('accountSearch').focus();
  }
  if (event.key === 'Escape') {
    if (!$('wizard').hidden) closeWizard();
    else if (!$('detailSheet').hidden) closeSheet();
    else closeMobile();
  }
});
$('roleSelect').addEventListener('change', renderRole);
$('heroAction').addEventListener('click', () => {
  const target = $('heroAction').dataset.target;
  if (target === 'wizard') openWizard();
  else showView(target);
});
$('priorityGrid').addEventListener('click', (event) => {
  const card = event.target.closest('[data-target]');
  if (card) showView(card.dataset.target);
});
$('recentAll').addEventListener('click', () =>
  showView(
    $('roleSelect').value === 'technician'
      ? 'customers'
      : ['auditor', 'supervisor'].includes($('roleSelect').value)
        ? 'insights'
        : 'money',
  ),
);
$('accountSearch').addEventListener('input', renderAccounts);
$('searchAccount').addEventListener('click', renderAccounts);
document.querySelectorAll('[data-filter]').forEach((button) =>
  button.addEventListener('click', () => {
    accountFilter = button.dataset.filter;
    document
      .querySelectorAll('[data-filter]')
      .forEach((chip) => chip.classList.toggle('is-selected', chip === button));
    renderAccounts();
  }),
);
$('accountGrid').addEventListener('click', (event) => {
  const card = event.target.closest('[data-person]');
  if (card) openSheet('account', card.dataset.person);
});
$('newSubscriber').addEventListener('click', () => openSheet('plan'));
['moneyPayment', 'moneyReceive'].forEach((id) =>
  $(id).addEventListener('click', () => openWizard()),
);
$('moneyVerify').addEventListener('click', () => openSheet('verify'));
$('moneyBilling').addEventListener('click', () => openSheet('billing'));
document
  .querySelectorAll('[data-record]')
  .forEach((button) =>
    button.addEventListener('click', () => openSheet('register')),
  );
$('fieldAll').addEventListener('click', () => openSheet('register'));
document
  .querySelectorAll('[data-question]')
  .forEach((button) =>
    button.addEventListener('click', () => openSheet(button.dataset.question)),
  );
$('reviewBackup').addEventListener('click', () => openSheet('backups'));
$('sheetClose').addEventListener('click', closeSheet);
$('sheetScrim').addEventListener('click', closeSheet);
$('wizardClose').addEventListener('click', closeWizard);
$('wizardBackdrop').addEventListener('click', closeWizard);
$('wizardBack').addEventListener('click', () => {
  wizardStep -= 1;
  renderWizard();
});
$('wizardNext').addEventListener('click', nextWizard);
$('caseGrid').innerHTML = [
  [
    'Imelda Corpuz',
    'Cable Plus · South District',
    'Oldest unpaid 15 Jul; no recent payment.',
    '₱750',
  ],
  [
    'Rolando Sison',
    'Cable Basic · Central District',
    'Suspension review is due today.',
    '₱550',
  ],
  [
    'Mark Alonzo',
    'Combo 50 · North District',
    'Two months overdue; assigned collector.',
    '₱3,198',
  ],
]
  .map(
    ([name, service, note, amount]) =>
      `<button class="case-card" data-case="${name}" type="button"><span class="status warn">Needs follow-up</span><strong style="margin-top:18px">${name}</strong><small>${service}</small><p>${note}</p><span class="case-bottom"><b>${amount}</b><span class="text-button">Review case ↗</span></span></button>`,
  )
  .join('');
$('caseGrid').addEventListener('click', (event) => {
  const card = event.target.closest('[data-case]');
  if (card) openSheet(`${card.dataset.case} follow-up`);
});
renderRole();
renderAccounts();
