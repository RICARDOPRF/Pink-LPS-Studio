// Pink Core V7 — LPS registry + explicit people memory
// Identity memory is based on what a person tells Pink (name/relationship), never on voice biometrics.
(() => {
  const PEOPLE_KEY = 'pink_people_memory_v1';
  const PENDING_KEY = 'pink_pending_person_v1';

  const PROJECTS = [
    {
      id: 'lps',
      name: 'Lean Performance Solutions',
      url: 'https://www.leanperformancesolutions.com.br/',
      aliases: ['lean performance', 'lean performance solutions', 'site da lps', 'site lps', 'lps']
    },
    {
      id: 'calculadora',
      name: 'Calculadora do Planejador',
      url: 'https://calculadora.leanperformancesolutions.com.br/',
      aliases: ['calculadora', 'calculadora do planejador', 'app calculadora']
    },
    {
      id: 'duoplanning',
      name: 'DuooPlanning',
      url: 'https://ricardoprf.github.io/DuooPlanning/',
      aliases: ['duoplanning', 'duoo planning', 'duo planning', 'curso lps', 'plataforma de cursos']
    },
    {
      id: 'prospect',
      name: 'LPS Prospect',
      url: 'https://leanperformancesolutions.github.io/LPS-Prospect./',
      aliases: ['lps prospect', 'prospect', 'prospecção', 'prospeccao', 'empresas sem site']
    },
    {
      id: 'pink',
      name: 'Pink LPS Studio',
      url: 'https://ricardoprf.github.io/Pink-LPS-Studio/',
      aliases: ['pink', 'pink studio', 'pink lps', 'central pink']
    }
  ];

  const RELATIONS = [
    ['namorada', 'namorada'], ['namorado', 'namorado'], ['esposa', 'esposa'], ['marido', 'marido'],
    ['noiva', 'noiva'], ['noivo', 'noivo'], ['companheira', 'companheira'], ['companheiro', 'companheiro'],
    ['amiga', 'amiga'], ['amigo', 'amigo'], ['irmã', 'irmã'], ['irma', 'irmã'], ['irmão', 'irmão'], ['irmao', 'irmão'],
    ['mãe', 'mãe'], ['mae', 'mãe'], ['pai', 'pai'], ['filha', 'filha'], ['filho', 'filho'],
    ['prima', 'prima'], ['primo', 'primo'], ['tia', 'tia'], ['tio', 'tio'], ['colega', 'colega'],
    ['sócia', 'sócia'], ['socia', 'sócia'], ['sócio', 'sócio'], ['socio', 'sócio'],
    ['chefe', 'chefe'], ['gestor', 'gestor'], ['gestora', 'gestora']
  ];

  let activeConversation = null;

  function normalize(value='') {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function loadPeople() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PEOPLE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function savePeople(people) {
    try { localStorage.setItem(PEOPLE_KEY, JSON.stringify(people)); } catch (_) {}
  }

  function keyForName(name) {
    return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function prettyName(name='') {
    return String(name).trim().split(/\s+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
  }

  function extractName(text='') {
    const raw = String(text).trim();
    const match = raw.match(/\b(?:eu\s+sou|meu\s+nome\s+(?:é|e)|me\s+chamo)\s+(?:a|o)?\s*([A-Za-zÀ-ÿ'’-]+)(?:\s+([A-Za-zÀ-ÿ'’-]+))?/i);
    if (!match) return null;
    const stop = new Set(['namorada','namorado','esposa','marido','noiva','noivo','amiga','amigo','irma','irmã','irmao','irmão','mae','mãe','pai','do','da','de','e','sou']);
    const first = match[1];
    const second = match[2] && !stop.has(normalize(match[2])) ? match[2] : '';
    const name = prettyName([first, second].filter(Boolean).join(' '));
    return name.length >= 2 ? name : null;
  }

  function extractRelationship(text='') {
    const n = normalize(text);
    for (const [needle, canonical] of RELATIONS) {
      const k = normalize(needle);
      const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(n)) return canonical;
    }
    return null;
  }

  function getPending() {
    try { return sessionStorage.getItem(PENDING_KEY) || ''; } catch (_) { return ''; }
  }

  function setPending(name='') {
    try {
      if (name) sessionStorage.setItem(PENDING_KEY, name);
      else sessionStorage.removeItem(PENDING_KEY);
    } catch (_) {}
  }

  function rememberPerson(name, relationship=null) {
    const people = loadPeople();
    const key = keyForName(name);
    const previous = people[key] || {};
    const now = new Date().toISOString();
    people[key] = {
      name: prettyName(name),
      relationship: relationship || previous.relationship || null,
      firstSeenAt: previous.firstSeenAt || now,
      lastSeenAt: now,
      source: 'self-reported'
    };
    savePeople(people);
    return people[key];
  }

  function findPerson(name) {
    return loadPeople()[keyForName(name)] || null;
  }

  function sendContext(text) {
    try { activeConversation?.sendContextualUpdate?.(String(text)); } catch (error) { console.warn('Pink contextual update failed', error); }
  }

  function memorySummary() {
    const people = Object.values(loadPeople());
    if (!people.length) return 'Nenhuma pessoa adicional foi registrada ainda.';
    return people.map(p => `${p.name}${p.relationship ? ` — ${p.relationship} do Paulo` : ' — relação ainda não informada'}`).join('; ');
  }

  function findProject(text='') {
    const n = normalize(text);
    if (!/(abre|abrir|abra|mostra|mostrar|mostre|entra|entrar|acesse|acessa|ir para|vai para|va para)/.test(n)) return null;
    return PROJECTS.find(project => project.aliases.some(alias => n.includes(normalize(alias)))) || null;
  }

  function openProject(project) {
    const preview = document.querySelector('#previewArea');
    const address = document.querySelector('#previewAddress');
    const title = document.querySelector('#previewTitle');
    const text = document.querySelector('#previewText');
    if (address) address.textContent = project.url.replace(/^https?:\/\//, '');
    if (title) title.textContent = project.name;
    if (text) text.textContent = `Abrindo ${project.name} dentro da Central Pink.`;
    if (preview) {
      preview.innerHTML = `
        <div class="pink-live-preview" style="width:100%;height:100%;min-height:420px;position:relative;background:#02060c">
          <iframe title="${project.name}" src="${project.url}" style="width:100%;height:100%;min-height:420px;border:0;background:#fff" allow="microphone; clipboard-read; clipboard-write" loading="eager"></iframe>
          <a href="${project.url}" target="_blank" rel="noopener" style="position:absolute;right:12px;bottom:12px;padding:8px 12px;border-radius:10px;background:rgba(4,11,22,.86);color:white;text-decoration:none;font:600 12px Inter,sans-serif;border:1px solid rgba(255,255,255,.16)">Abrir em nova aba ↗</a>
        </div>`;
    } else {
      window.open(project.url, '_blank', 'noopener');
    }
    sendContext(`A interface da Pink acabou de abrir o sistema "${project.name}" (${project.url}) em resposta ao pedido do usuário. Confirme de forma curta que a tela foi aberta.`);
    window.PinkEvolution?.recordSession?.(`open-project:${project.id}`);
    return project;
  }

  function handleIdentity(text='') {
    const name = extractName(text);
    const statedRelationship = extractRelationship(text);

    if (name) {
      const existing = findPerson(name);
      const person = rememberPerson(name, statedRelationship);
      if (person.relationship) {
        setPending('');
        sendContext(`A pessoa se apresentou explicitamente como ${person.name}. Ela informou que é ${person.relationship} do Paulo. Isso é memória auto-declarada, não reconhecimento biométrico. Cumprimente-a pelo nome e não revele dados de outras pessoas.`);
      } else if (existing?.relationship) {
        setPending('');
        sendContext(`A pessoa se apresentou explicitamente como ${person.name}. Na memória local auto-declarada, ela é ${existing.relationship} do Paulo. Cumprimente-a naturalmente pelo nome. Não diga que reconheceu a voz e não exponha a lista de memória.`);
      } else {
        setPending(person.name);
        sendContext(`Uma nova pessoa se apresentou explicitamente como ${person.name}. Não use reconhecimento de voz para confirmar identidade. Pergunte de forma natural e curta: "Prazer, ${person.name}. O que você é do Paulo?" Depois use a resposta apenas como memória auto-declarada.`);
      }
      return person;
    }

    const pending = getPending();
    if (pending) {
      const relationship = extractRelationship(text);
      if (relationship) {
        const person = rememberPerson(pending, relationship);
        setPending('');
        sendContext(`${person.name} acabou de informar que é ${person.relationship} do Paulo. Confirme de forma natural que você entendeu e guardou essa informação. Não diga que identificou a pessoa pela voz.`);
        return person;
      }
      if (/(prefiro nao|prefiro não|nao quero dizer|não quero dizer|não quero falar|nao quero falar)/i.test(text)) {
        setPending('');
        sendContext(`${pending} preferiu não informar a relação com Paulo. Respeite isso e siga a conversa sem insistir.`);
      }
    }
    return null;
  }

  function handleUserSpeech(text='') {
    const spoken = String(text).trim();
    if (!spoken) return;
    handleIdentity(spoken);
    const project = findProject(spoken);
    if (project) openProject(project);
  }

  function attachConversation(conversation) {
    activeConversation = conversation || null;
    if (!activeConversation) return;
    sendContext(`Você está na Central Pink da Lean Performance Solutions. Sistemas registrados para navegação por voz: ${PROJECTS.map(p => p.name).join(', ')}. Memória local auto-declarada de pessoas: ${memorySummary()}. Regra de privacidade: nunca afirme reconhecer alguém pela voz; use apenas o nome que a própria pessoa disser e nunca revele a lista de pessoas para outro usuário.`);
  }

  function detachConversation() {
    activeConversation = null;
  }

  window.PinkCore = {
    projects: PROJECTS.map(p => ({...p})),
    attachConversation,
    detachConversation,
    handleUserSpeech,
    openProject: (idOrName) => {
      const q = normalize(idOrName);
      const project = PROJECTS.find(p => p.id === q || normalize(p.name) === q || p.aliases.some(a => normalize(a) === q));
      return project ? openProject(project) : null;
    },
    people: {
      list: () => Object.values(loadPeople()),
      remember: rememberPerson,
      clear: () => { localStorage.removeItem(PEOPLE_KEY); setPending(''); }
    }
  };
})();