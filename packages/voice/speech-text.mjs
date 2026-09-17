const REPLACEMENTS=[[/\bURL\b/gi,'link'],[/\bAPI\b/gi,'API'],[/\bCI\b/g,'CI']];

export function toSpeechText(input,{maxChars=1800}={}){
  let text=String(input||'');
  text=text.replace(/```[\s\S]*?```/g,' um trecho de código. ')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,' $1 ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'$1')
    .replace(/https?:\/\/\S+/gi,' link ')
    .replace(/^\s{0,3}#{1,6}\s*/gm,'')
    .replace(/^\s*>\s?/gm,'')
    .replace(/^\s*[-*+]\s+/gm,'')
    .replace(/^\s*\d+[.)]\s+/gm,'')
    .replace(/[*_~]+/g,'')
    .replace(/[|]+/g,', ')
    .replace(/\s*→\s*/g,', depois ')
    .replace(/\s*↓\s*/g,'. ')
    .replace(/\n{2,}/g,'. ')
    .replace(/\n/g,' ')
    .replace(/\s+/g,' ')
    .replace(/\s+([,.;!?])/g,'$1')
    .trim();
  for(const [pattern,value] of REPLACEMENTS)text=text.replace(pattern,value);
  if(text.length>maxChars){
    const cut=text.slice(0,maxChars);const stop=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('! '),cut.lastIndexOf('? '));
    text=(stop>maxChars*.55?cut.slice(0,stop+1):cut).trim();
  }
  return text;
}

export function conversationalVoiceInstruction(){
  return 'Responda para conversa falada em português do Brasil. Seja natural, solta e direta. Use frases curtas. Não fale Markdown, asteriscos, hashtags, bullets, URLs, nomes de formatação ou estruturas de tabela. Evite ler listas longas; resuma e ofereça detalhes na tela quando necessário.';
}
