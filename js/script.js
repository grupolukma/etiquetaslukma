/*****************************************
 * script.js — BlueTech Etiquetas (GET + Sheets + Preview na Consulta)
 ******************************************/

/********** CONFIG **********/
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyTxFo7Cryc2_UQvDI37KOnvl9EzQUtgnfQgGHA9sQ4nJWlB9giatMmJCYwVMf_Me6y/exec';
/****************************/

/* ===== Utils ===== */
function getFormattedDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function setLoading(btnId, isLoading, idleText, loadingText = 'Gerando...') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = !!isLoading;
  btn.textContent = isLoading ? loadingText : (idleText || btn.dataset.labelIdle || btn.textContent);
}
function sheetsConfigured() {
  return !!(GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.startsWith('https://script.google.com/'));
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ===== QR com LOGO nítido ===== */
const LOGO_SRC = 'assets/img/logo.png';
const logoImg = new Image();
logoImg.src = LOGO_SRC;
logoImg.crossOrigin = 'anonymous';

function gerarQRCode(elementId, link) {
  const el = document.getElementById(elementId);
  el.innerHTML = '';

  if (typeof QRCode === 'undefined') {
    console.error('qrcode.js não carregado');
    el.innerHTML = `<span style="color:red">ERRO: QR Code não gerado.</span>`;
    return;
  }

  const size = 240; // alto DPI; CSS reduz p/ 15mm
  new QRCode(el, {
    text: link, width: size, height: size,
    colorDark: '#000',
    correctLevel: QRCode.CorrectLevel.H
  });

  const canvas = el.querySelector('canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const s = Math.min(canvas.width, canvas.height);

  const logoRatio = 0.22;
  const logoSize = Math.round(s * logoRatio);
  const pad = Math.round(logoSize * 0.22);
  const bgSize = logoSize + pad;

  const bgX = Math.round((s - bgSize) / 2);
  const bgY = Math.round((s - bgSize) / 2);
  const logoX = Math.round((s - logoSize) / 2);
  const logoY = Math.round((s - logoSize) / 2);

  const drawLogo = () => {
    ctx.imageSmoothingEnabled = false;
    // ctx.fillStyle = '#fff'; //fundo branco logo caso não tenha
    ctx.fillRect(bgX, bgY, bgSize, bgSize);
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
  };
  if (logoImg.complete) drawLogo(); else logoImg.onload = drawLogo;
}

/* ===== Geração de etiqueta em um container específico ===== */
function montarEtiquetaNoContainer({ pedido, quadro, link, data }, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const col = (id) => `
    <div class="etiqueta-coluna">
      <div class="cabecalho">
        Pedido: ${pedido}<br>
        Cód. Quadro: ${quadro}
      </div>
      <div class="area-qr-data">
        <div class="area-qr" id="${containerId}-qrcode-${id}"></div>
        <div class="data-lateral">${data}</div>
      </div>
    </div>
  `;
  container.innerHTML = col(1) + col(2);

  gerarQRCode(`${containerId}-qrcode-1`, link);
  gerarQRCode(`${containerId}-qrcode-2`, link);
}

/* ===== Gerar & Visualizar (aba Gerar) ===== */
async function gerarEtiquetas() {
  const pedido = document.getElementById('pedido').value.trim();
  const quadro = document.getElementById('quadro').value.trim();
  const link   = document.getElementById('link_qrcode').value.trim();
  const data   = getFormattedDate();

  if (!pedido || !quadro || !link) {
    alert('Por favor, preencha todos os campos (Nº do Pedido, Cód. do Quadro, Link do QR).');
    return;
  }

  montarEtiquetaNoContainer({ pedido, quadro, link, data }, 'containerEtiquetas');

  // habilita botões da aba Gerar
  document.getElementById('actionButtonsGroup').style.display = 'flex';
  document.getElementById('btnPdf').disabled = false;
  document.getElementById('btnPng').disabled = false;

  // salva no Sheets via GET (id gerado no backend)
  try {
    await registrarNoGoogleSheets_GET({ pedido, quadro, link, data });
    console.log('✅ Registro salvo (GET) no Sheets:', { pedido, quadro, link, data });
    // se estiver visualizando a aba Consultar, recarrega
    if (document.getElementById('tab-consultar')?.classList.contains('active')) {
      carregarRegistros();
    }
  } catch (err) {
    console.error('❌ Falha ao registrar no Sheets (GET):', err);
  }
}

/* ===== PDF/PNG genéricos (funciona para os dois previews) ===== */
async function gerarPdfAbrirBaixar(containerId, btnId) {
  const container = document.getElementById(containerId);
  if (!container || !container.children.length) {
    alert('Primeiro gere a visualização.');
    return;
  }
  setLoading(btnId, true, 'GERAR PDF');
  container.classList.add('capture-mode');
  const oldBorder = container.style.border;
  container.style.border = 'none';

  try {
    const canvas = await html2canvas(container, { scale: 4, useCORS: true, logging: false });
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: [105, 35] });
    const img = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(img, 'JPEG', 0, 0, 105, 35);

    // tenta usar o pedido exibido nos inputs; se estiver vazio, usa 'etiquetas'
    const pedido = document.getElementById('pedido')?.value || 'etiquetas';
    pdf.save(`etiquetas_${pedido}_${Date.now()}.pdf`);
  } catch (e) {
    console.error(e);
    alert('Falha ao gerar o PDF.');
  } finally {
    container.classList.remove('capture-mode');
    container.style.border = oldBorder || '1px dashed #cbd5e1';
    setLoading(btnId, false, 'GERAR PDF');
  }
}

async function gerarPngAbrirBaixar(containerId, btnId) {
  const container = document.getElementById(containerId);
  if (!container || !container.children.length) {
    alert('Primeiro gere a visualização.');
    return;
  }
  setLoading(btnId, true, 'GERAR PNG');
  container.classList.add('capture-mode');
  const oldBorder = container.style.border;
  container.style.border = 'none';

  try {
    const canvas = await html2canvas(container, { scale: 4, useCORS: true, logging: false });
    await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Blob vazio'));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const pedido = document.getElementById('pedido')?.value || 'etiquetas';
        a.download = `etiquetas_${pedido}_${Date.now()}.png`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        resolve();
      }, 'image/png', 1.0);
    });
  } catch (e) {
    console.error(e);
    alert('Falha ao gerar o PNG.');
  } finally {
    container.classList.remove('capture-mode');
    container.style.border = oldBorder || '1px dashed #cbd5e1';
    setLoading(btnId, false, 'GERAR PNG');
  }
}

/* ===== Registrar no Sheets (GET) ===== */
async function registrarNoGoogleSheets_GET(reg) {
  if (!sheetsConfigured()) {
    console.warn('GOOGLE_SCRIPT_URL não configurada.');
    return;
  }
  const params = new URLSearchParams({
    action: 'add',
    pedido: reg.pedido || '',
    quadro: reg.quadro || '',
    link:   reg.link   || '',
    data:   reg.data   || '',
    _ts: String(Date.now())
  });
  const url = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
  const resp = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}

/* ===== Consultar (lista) — com data ISO -> dd/mm/yyyy e preview ao lado ===== */
async function carregarRegistros() {
  const tbody = document.getElementById('tableBody');
  if (!sheetsConfigured()) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#c00;">Configure a URL no script.js</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#777;">Carregando...</td></tr>`;

  try {
    const url = `${GOOGLE_SCRIPT_URL}?action=list&_=${Date.now()}`;
    const resp = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!resp.ok || !data || data.ok !== true) {
      throw new Error(data?.message || text);
    }

    const rows = data.data || [];

    // 🔹 Converte ISO -> DD/MM/YYYY
    const formatarDataBR = (valor) => {
      if (!valor) return '';
      if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) {
        try {
          const d = new Date(valor);
          const dia = String(d.getDate()).padStart(2, '0');
          const mes = String(d.getMonth() + 1).padStart(2, '0');
          const ano = d.getFullYear();
          return `${dia}/${mes}/${ano}`;
        } catch { return valor; }
      }
      return valor;
    };

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#777;">Nenhum registro encontrado</td></tr>`;
      // limpa preview da direita também
      document.getElementById('containerEtiquetasConsulta').innerHTML = '';
      document.getElementById('btnPdfConsulta').disabled = true;
      document.getElementById('btnPngConsulta').disabled = true;
      return;
    }

    tbody.innerHTML = rows.map((r, idx) => {
      const dataFormatada = formatarDataBR(r.data);
      return `
        <tr>
          <td>${r.id || ''}</td>
          <td>${r.pedido || ''}</td>
          <td>${r.quadro || ''}</td>
          <td><button class="btn-mini" data-idx="${idx}">Gerar e Visualizar</button></td>
          <td>${dataFormatada}</td>
        </tr>
      `;
    }).join('');

    // clique: gera prévia no painel da direita (sem salvar)
    document.querySelectorAll('.btn-mini').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.idx, 10);
        const item = rows[i];
        if (!item) return;

        const dataFormatada = formatarDataBR(item.data);

        montarEtiquetaNoContainer({
          pedido: item.pedido,
          quadro: item.quadro,
          link:   item.link,
          data:   dataFormatada
        }, 'containerEtiquetasConsulta');

        document.getElementById('btnPdfConsulta').disabled = false;
        document.getElementById('btnPngConsulta').disabled = false;
      });
    });

  } catch (err) {
    console.error('Erro ao carregar registros:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#c00;">Erro ao carregar</td></tr>`;
  }
}

/* ===== Abas ===== */
function ativarAba(id) {
  const btns = document.querySelectorAll('.tab-btn');
  const panes = document.querySelectorAll('.tab-pane');
  btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === id));
  panes.forEach(p => p.classList.toggle('active', p.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (id === 'tab-consultar') carregarRegistros();
}
function initTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach(b => b.addEventListener('click', () => ativarAba(b.getAttribute('data-tab'))));
  if (document.getElementById('tab-consultar')?.classList.contains('active')) {
    carregarRegistros();
  }
}

/* ===== Inicialização ===== */
function initializePage() {
  const dataEl = document.getElementById('data_display');
  if (dataEl) dataEl.textContent = getFormattedDate();

  // desabilita botões até ter preview
  ['btnPdf','btnPng','btnPdfConsulta','btnPngConsulta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  initTabs();

  // se mexer nos inputs, desabilita PDF/PNG da aba Gerar
  ['pedido','quadro','link_qrcode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      const b1 = document.getElementById('btnPdf');
      const b2 = document.getElementById('btnPng');
      if (b1) b1.disabled = true;
      if (b2) b2.disabled = true;
    });
  });
}
document.addEventListener('DOMContentLoaded', initializePage);

/* ===== Expor no escopo global ===== */
window.gerarEtiquetas = gerarEtiquetas;
window.gerarPdfAbrirBaixar = gerarPdfAbrirBaixar;
window.gerarPngAbrirBaixar = gerarPngAbrirBaixar;
window.carregarRegistros = carregarRegistros;
window.ativarAba = ativarAba;
