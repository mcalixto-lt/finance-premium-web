/* Dados fictícios centralizados. Edite este arquivo para personalizar valores e registros. */
window.FINANCE_MOCK_DATA = {
    meta: { openingBalance: 18000, openingCash: 1320 },
    summary: [
      { key:'balance', label:'Saldo Total', value:24580.75, trend:'↑ 8,56% vs Abr', icon:'i-summary-wallet', tone:'gold', accent:'#e2b35d' },
      { key:'pix', label:'Pix', value:3245.90, trend:'↑ 12,40%', icon:'i-summary-pix', tone:'teal', accent:'#28cbb8' },
      { key:'cash', label:'Dinheiro', value:1320.00, trend:'↓ 3,10%', icon:'i-summary-cash', tone:'blue', accent:'#4699ff', down:true },
      { key:'debit', label:'Débito', value:2185.40, trend:'↑ 4,35%', icon:'i-summary-debit', tone:'purple', accent:'#9a61f6' },
      { key:'credit', label:'Crédito', value:6742.15, trend:'↑ 9,20%', icon:'i-summary-credit', tone:'pink', accent:'#e460a9' },
      { key:'receivable', label:'Valores a Receber', value:5870.50, trend:'↑ 18,60%', icon:'i-summary-receivable', tone:'orange', accent:'#f0a94b' }
    ],
    transactions: [
      {id:'t1', date:'2025-05-29', description:'Mercado Pão de Açúcar', category:'Alimentação', type:'Saída', payment:'Débito', value:254.80, installments:'—', logo:'P', logoColor:'#5cc641', receipt:true},
      {id:'t2', date:'2025-05-29', description:'Uber *Trip', category:'Transporte', type:'Saída', payment:'Crédito', value:37.90, installments:'1x', logo:'U', logoColor:'#050505', receipt:true},
      {id:'t3', date:'2025-05-28', description:'Salário', category:'Recebimento', type:'Entrada', payment:'Conta', value:5800.00, installments:'—', logo:'M', logoColor:'#2688ef', receipt:false},
      {id:'t4', date:'2025-05-28', description:'Magazine Luiza', category:'Compras', type:'Saída', payment:'Crédito', value:1299.00, installments:'3x', logo:'M', logoColor:'#2889ec', receipt:true},
      {id:'t5', date:'2025-05-27', description:'Posto Ipiranga', category:'Transporte', type:'Saída', payment:'Débito', value:280.45, installments:'—', logo:'I', logoColor:'#f6bf21', receipt:true},
      {id:'t6', date:'2025-05-27', description:'iFood', category:'Alimentação', type:'Saída', payment:'Crédito', value:68.30, installments:'1x', logo:'iF', logoColor:'#ea2448', receipt:true},
      {id:'t7', date:'2025-05-25', description:'Netflix', category:'Assinatura', type:'Saída', payment:'Crédito', value:55.90, installments:'2/12', logo:'N', logoColor:'#050505', receipt:false},
      {id:'t8', date:'2025-05-24', description:'Pix recebido — Carlos Mendes', category:'Recebimento', type:'Entrada', payment:'Pix', value:1250.00, installments:'—', logo:'P', logoColor:'#1eb99f', receipt:false},
      {id:'t9', date:'2025-05-22', description:'Academia Smart Fit', category:'Saúde', type:'Saída', payment:'Crédito', value:129.90, installments:'4/12', logo:'SF', logoColor:'#e9a619', receipt:true},
      {id:'t10', date:'2025-05-20', description:'Amazon Prime', category:'Assinatura', type:'Saída', payment:'Crédito', value:19.90, installments:'5/12', logo:'P', logoColor:'#1878cc', receipt:false}
    ],
    installments: [
      {id:'p1', name:'Netflix', subtitle:'Plano Padrão', current:2, total:12, due:'10/06', value:55.90, logo:'N', color:'#050505'},
      {id:'p2', name:'Academia Smart Fit', subtitle:'Plano Black', current:4, total:12, due:'15/06', value:129.90, logo:'fit', color:'#050505'},
      {id:'p3', name:'Amazon Prime', subtitle:'Assinatura', current:5, total:12, due:'20/06', value:19.90, logo:'prime', color:'#075eaa'},
      {id:'p4', name:'Seguro Auto', subtitle:'Proteção Completa', current:6, total:12, due:'25/06', value:198.50, logo:'◆', color:'#1d579b'}
    ],
    thirdParties: [
      {id:'x1', name:'Carlos Mendes', description:'Empréstimo pessoal', status:'A Receber', value:1250.00, initials:'CM', avatar:'assets/images/avatar-carlos.svg', cardId:'c1', installmentsCurrent:1, installmentsTotal:3, purchaseDate:'2025-05-24', category:'Terceiros'},
      {id:'x2', name:'Ana Carolina', description:'Divisão de despesas', status:'A Pagar', value:320.00, initials:'AC', avatar:'assets/images/avatar-ana.svg', cardId:'', installmentsCurrent:1, installmentsTotal:1, purchaseDate:'2025-05-23', category:'Terceiros'},
      {id:'x3', name:'Empresa Alfa Ltda.', description:'Reembolso corporativo', status:'A Receber', value:2800.50, initials:'EA', avatar:'assets/images/avatar-empresa.svg', cardId:'c2', installmentsCurrent:2, installmentsTotal:6, purchaseDate:'2025-05-22', category:'Terceiros'},
      {id:'x4', name:'João Oliveira', description:'Jantar compartilhado', status:'A Pagar', value:540.00, initials:'JO', avatar:'assets/images/avatar-joao.svg', cardId:'', installmentsCurrent:1, installmentsTotal:1, purchaseDate:'2025-05-21', category:'Terceiros'}
    ],
    cards: [
      {id:'c1', name:'Visa Infinite', brand:'VISA', last4:'4242', holder:'BRUNO SILVA', total:22000, available:7894.30, openingUsed:14105.70, close:'05/06', due:'15/06', gradient:'linear-gradient(145deg,#181c22,#06080c 72%)'},
      {id:'c2', name:'Mastercard Black', brand:'Mastercard', last4:'1128', holder:'BRUNO SILVA', total:12000, available:8000, openingUsed:4000, close:'12/06', due:'22/06', gradient:'linear-gradient(145deg,#2b173d,#11101d 72%)'},
      {id:'c3', name:'Visa Gold', brand:'VISA', last4:'7801', holder:'BRUNO SILVA', total:6000, available:4000, openingUsed:2000, close:'18/06', due:'28/06', gradient:'linear-gradient(145deg,#7b4d1c,#1f1510 72%)'}
    ],
    invoices: [
      {id:'f1', card:'Visa Infinite • 4242', month:'Junho/2025', value:4326.80, due:'15/06/2025', status:'Aberta'},
      {id:'f2', card:'Mastercard Black • 1128', month:'Junho/2025', value:2110.50, due:'22/06/2025', status:'Aberta'},
      {id:'f3', card:'Visa Infinite • 4242', month:'Maio/2025', value:7850.40, due:'15/05/2025', status:'Paga'}
    ],
    budgets: [
      {name:'Moradia', used:3744.15, limit:4500, color:'#2dd4a8'},
      {name:'Alimentação', used:2369.40, limit:3000, color:'#ef536d'},
      {name:'Transporte', used:1747.60, limit:2200, color:'#3e8ae0'},
      {name:'Lazer', used:1498.30, limit:1600, color:'#8a50d0'}
    ],
    goals: [
      {name:'Reserva de emergência', current:18500, target:30000, color:'#e2b35d'},
      {name:'Viagem de férias', current:6400, target:12000, color:'#28cbb8'},
      {name:'Novo computador', current:5200, target:8000, color:'#9a61f6'}
    ],
    categories: [
      {name:'Moradia', percent:30, value:3744.15, color:'#2dd4a8'},
      {name:'Alimentação', percent:19, value:2369.40, color:'#ef536d'},
      {name:'Transporte', percent:14, value:1747.60, color:'#eeb64d'},
      {name:'Lazer', percent:12, value:1498.30, color:'#3e8ae0'},
      {name:'Saúde', percent:8, value:998.20, color:'#8a50d0'},
      {name:'Outros', percent:17, value:2123.85, color:'#657180'}
    ]
  };
