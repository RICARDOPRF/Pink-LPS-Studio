import catalog from './catalog.json' with { type: 'json' };

const LEVELS = new Set(catalog.teachingLevels);
const EVIDENCE = new Set(catalog.evidenceClasses);

export class PinkScienceLibrary {
  constructor(data = catalog) { this.data = structuredClone(data); }
  domains() { return structuredClone(this.data.domains); }
  sources() { return structuredClone(this.data.sources); }
  source(id) { return structuredClone(this.data.sources.find((s)=>s.id===id) || null); }
  classifyEvidence(value) {
    const key=String(value||'').trim();
    if (!EVIDENCE.has(key)) throw new TypeError('unknown evidence class');
    return key;
  }
  studyPlan({ hours = 4, level = 'intermediario' } = {}) {
    const h=Math.max(1,Math.min(24,Number(hours)||4));
    if (!LEVELS.has(level)) throw new TypeError('unknown teaching level');
    const domains=this.data.domains;
    const minutes=Math.floor((h*60)/domains.length);
    return {
      library:this.data.library, level, requestedHours:h,
      sessions:domains.map((d,i)=>({
        order:i+1, domainId:d.id, title:d.title, minutes,
        topics:[...d.topics],
        method:['fundamentos','equações e unidades','exemplo resolvido','dados reais','quiz','explicação pela Pink']
      })),
      assessment:{quizPerDomain:8,minimumScore:0.8,requireProvenance:true},
      rule:this.data.principle
    };
  }
  teacherPrompt({ level='intermediario', topic='física' }={}) {
    if (!LEVELS.has(level)) throw new TypeError('unknown teaching level');
    return [
      'Você é Pink Science Teacher.',
      'Ensine em português brasileiro com rigor científico.',
      `Nível do aluno: ${level}. Tema: ${String(topic).slice(0,200)}.`,
      'Comece pela intuição, depois matemática, unidades, exemplo e exercício.',
      'Separe fato estabelecido, dado experimental, simulação e hipótese.',
      'Cite a proveniência disponível. Se não houver evidência, diga explicitamente que não há evidência suficiente.',
      'Nunca trate teletransporte macroscópico, warp drive, alienígenas ou wormholes como tecnologia comprovada.',
      'NO EVIDENCE -> NO CLAIM.'
    ].join(' ');
  }
  snapshot(){ return structuredClone(this.data); }
}

export const pinkScienceLibrary = new PinkScienceLibrary();
