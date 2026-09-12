// Pink NVIDIA Bridge V1
// Safe browser client: NVIDIA_API_KEY lives only in Supabase Edge Function secrets.
(() => {
  const SUPABASE_URL = 'https://membyrbgynicllzrhjsl.supabase.co';
  // Supabase legacy anon key is intentionally publishable and may be used by browser clients.
  // It is NOT the NVIDIA API key.
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbWJ5cmJneW5pY2xsenJoanNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzE3MTAsImV4cCI6MjA5NzY0NzcxMH0.5_5fKYLYHlGCvggoF7t9QtwkvVaRX0LKkDtw--brJY0';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/pink-nvidia`;
  const DEFAULT_SYSTEM = 'Você é o motor NVIDIA NIM auxiliar da Pink, assistente da Lean Performance Solutions. Responda em português do Brasil, com objetividade e precisão. Não invente acesso a sistemas ou dados que não estejam na conversa.';

  let lastStatus = 'idle';
  let lastModel = null;
  let lastError = null;

  function setStatus(status, detail = '') {
    lastStatus = status;
    const el = document.querySelector('#nvidiaStatus');
    if (!el) return;
    if (status === 'testing' || status === 'thinking') el.textContent = detail || 'Consultando NVIDIA…';
    else if (status === 'online') el.textContent = detail || 'NVIDIA NIM online';
    else if (status === 'error') el.textContent = detail || 'Falha na conexão NVIDIA';
    else el.textContent = detail || 'NVIDIA NIM conectado via Supabase';
  }

  async function ask(input, options = {}) {
    const messages = Array.isArray(input)
      ? input
      : [
          { role: 'system', content: options.system || DEFAULT_SYSTEM },
          { role: 'user', content: String(input ?? '') },
        ];

    if (!messages.length || !String(messages[messages.length - 1]?.content ?? '').trim()) {
      throw new Error('Mensagem vazia para NVIDIA');
    }

    setStatus(options.test ? 'testing' : 'thinking');
    lastError = null;

    try {
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          messages,
          temperature: options.temperature ?? 0.35,
          top_p: options.topP ?? 0.9,
          max_tokens: options.maxTokens ?? 900,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload?.details?.message || payload?.error || `HTTP ${response.status}`;
        throw new Error(detail);
      }

      lastModel = payload?.model || null;
      setStatus('online', lastModel ? `Online · ${lastModel}` : 'NVIDIA NIM online');
      window.PinkEvolution?.recordSession?.(`nvidia:${lastModel || 'online'}`);
      return {
        reply: String(payload?.reply || '').trim(),
        model: lastModel,
        usage: payload?.usage || null,
      };
    } catch (error) {
      lastError = error;
      setStatus('error', `Erro NVIDIA · ${error?.message || error}`);
      window.PinkEvolution?.recordIssue?.('nvidia-error', error?.message || error);
      throw error;
    }
  }

  async function testConnection() {
    const result = await ask([
      { role: 'system', content: 'Você está executando um teste de conectividade. Responda somente com: NVIDIA ONLINE' },
      { role: 'user', content: 'Teste de conexão da Pink.' },
    ], { test: true, temperature: 0, maxTokens: 64 });
    return result;
  }

  function bindSettingsTest() {
    const button = document.querySelector('#testNvidiaBtn');
    if (!button || button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Testando…';
      try {
        const result = await testConnection();
        button.textContent = result.reply.toUpperCase().includes('NVIDIA ONLINE') ? '✓ NVIDIA online' : '✓ Conectado';
      } catch (error) {
        console.error('Pink NVIDIA test failed', error);
        button.textContent = 'Falhou · tentar novamente';
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = original;
        }, 2600);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setStatus('idle');
    bindSettingsTest();
  });

  window.PinkNVIDIA = {
    ask,
    test: testConnection,
    getStatus: () => ({ status: lastStatus, model: lastModel, error: lastError?.message || null }),
    endpoint: FUNCTION_URL,
  };
})();
