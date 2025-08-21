class QuizManager {
  constructor() {
    this.quiz = null;
    this.perguntaAtual = 0;
    this.respostas = [];
    this.alternativasOriginais = []; // Para armazenar ordem original
    this.alternativasRandomizadas = []; // Para armazenar ordem randomizada
    this.baseURL = 'https://brainquiz-wel0.onrender.com';
    this.feedbackMostrado = false;
  }

  async carregarQuiz() {
    try {
      console.log('🔄 Iniciando carregamento do quiz...');
      
      // MÉTODO 1: Verificar URL params
      const urlParams = new URLSearchParams(window.location.search);
      const quizId = urlParams.get('id');
      
      if (quizId) {
        console.log('📋 Tentando carregar quiz por ID:', quizId);
        const quiz = await this.carregarQuizPorId(quizId);
        if (quiz && this.validarEstrutura(quiz)) {
          this.quiz = this.normalizarQuiz(quiz);
          return this.iniciarQuiz();
        }
      }

      // MÉTODO 2: Verificar dados do backend atual
      console.log('📋 Tentando carregar quiz do backend atual');
      const quizAtual = await this.carregarQuizAtual();
      if (quizAtual && this.validarEstrutura(quizAtual)) {
        this.quiz = this.normalizarQuiz(quizAtual);
        return this.iniciarQuiz();
      }

      // MÉTODO 3: Verificar quiz temporário no servidor
      console.log('📋 Tentando carregar quiz temporário do servidor');
      const quizTemp = await this.carregarQuizTemporario();
      if (quizTemp && this.validarEstrutura(quizTemp)) {
        this.quiz = this.normalizarQuiz(quizTemp);
        return this.iniciarQuiz();
      }

      // MÉTODO 4: Fallback para arquivo local
      console.log('📋 Tentando carregar quiz de arquivo local...');
      const quizLocal = await this.carregarQuizLocal();
      if (quizLocal && this.validarEstrutura(quizLocal)) {
        this.quiz = this.normalizarQuiz(quizLocal);
        return this.iniciarQuiz();
      }

      // Se chegou aqui, nenhum quiz foi encontrado
      this.mostrarErro('❌ Nenhum quiz encontrado. Redirecionando para o dashboard...');
      setTimeout(() => {
        window.location.href = 'https://brainquiz-wel0.onrender.com/dashboard.html';
      }, 3000);

    } catch (error) {
      console.error('❌ Erro crítico ao carregar quiz:', error);
      this.mostrarErro('❌ Erro ao carregar quiz. Tente novamente.');
    }
  }

  async carregarQuizPorId(id) {
    try {
      const response = await authManager.makeAuthenticatedRequest(
        `${this.baseURL}/api/quiz/${id}`
      );

      if (response.ok) {
        const data = await response.json();
        return data.quiz || data;
      }
    } catch (error) {
      console.error('Erro ao carregar quiz por ID:', error);
    }
    return null;
  }

  async carregarQuizAtual() {
    try {
      const response = await authManager.makeAuthenticatedRequest(
        `${this.baseURL}/api/quiz-atual`
      );

      if (response.ok) {
        const data = await response.json();
        return data.quiz || data;
      }
    } catch (error) {
      console.error('Erro ao carregar quiz atual:', error);
    }
    return null;
  }

  async carregarQuizTemporario() {
    try {
      const response = await authManager.makeAuthenticatedRequest(
        `${this.baseURL}/api/quiz-temp`
      );

      if (response.ok) {
        const data = await response.json();
        return data.quiz || data;
      }
    } catch (error) {
      console.error('Erro ao carregar quiz temporário:', error);
    }
    return null;
  }

  async carregarQuizLocal() {
    try {
      // Tentar carregar arquivo local como fallback
      const response = await fetch('./data/quiz_ativo.json');
      if (response.ok) {
        const quiz = await response.json();
        console.log('✅ Quiz carregado do arquivo local');
        return quiz;
      }
    } catch (error) {
      console.error('Erro ao carregar quiz local:', error);
    }
    return null;
  }

  validarEstrutura(quiz) {
    if (!quiz || !quiz.perguntas || !Array.isArray(quiz.perguntas)) {
      console.error('❌ Quiz inválido: estrutura básica incorreta');
      return false;
    }

    if (quiz.perguntas.length === 0) {
      console.error('❌ Quiz inválido: sem perguntas');
      return false;
    }

    const perguntasValidas = quiz.perguntas.every((pergunta, index) => {
      // Verificar se tem texto da pergunta
      if (!pergunta.pergunta && !pergunta.texto) {
        console.error(`❌ Pergunta ${index + 1}: sem texto`);
        return false;
      }

      // Verificar alternativas
      const alternativas = pergunta.alternativas || pergunta.opcoes || [];
      if (!Array.isArray(alternativas) || alternativas.length < 2) {
        console.error(`❌ Pergunta ${index + 1}: alternativas insuficientes`);
        return false;
      }

      // Verificar resposta correta
      const respostaCorreta = pergunta.respostaCorreta !== undefined 
        ? pergunta.respostaCorreta 
        : pergunta.resposta_certa;
      
      if (respostaCorreta === undefined || respostaCorreta < 0 || respostaCorreta >= alternativas.length) {
        console.error(`❌ Pergunta ${index + 1}: resposta correta inválida`);
        return false;
      }

      return true;
    });

    return perguntasValidas;
  }

  normalizarQuiz(quiz) {
    // Normalizar título
    quiz.titulo = quiz.titulo || quiz.nome || 'Quiz sem título';

    // Normalizar perguntas e randomizar alternativas
    quiz.perguntas = quiz.perguntas.map((pergunta, index) => {
      const perguntaNormalizada = {
        id: pergunta.id || `pergunta_${index}`,
        pergunta: pergunta.pergunta || pergunta.texto || '',
        alternativas: pergunta.alternativas || pergunta.opcoes || [],
        respostaCorreta: pergunta.respostaCorreta !== undefined 
          ? pergunta.respostaCorreta 
          : pergunta.resposta_certa,
        explicacao: pergunta.explicacao || '',
        tempo: pergunta.tempo || 30
      };

      // Armazenar alternativas originais
      this.alternativasOriginais[index] = [...perguntaNormalizada.alternativas];
      
      // Randomizar alternativas
      const alternativasComIndice = perguntaNormalizada.alternativas.map((alt, i) => ({
        texto: alt,
        indiceOriginal: i
      }));

      // Shuffle array
      for (let i = alternativasComIndice.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [alternativasComIndice[i], alternativasComIndice[j]] = [alternativasComIndice[j], alternativasComIndice[i]];
      }

      // Armazenar mapeamento
      this.alternativasRandomizadas[index] = alternativasComIndice;
      
      // Atualizar pergunta com alternativas randomizadas
      perguntaNormalizada.alternativas = alternativasComIndice.map(alt => alt.texto);
      
      // Atualizar índice da resposta correta
      const novoIndiceResposta = alternativasComIndice.findIndex(
        alt => alt.indiceOriginal === perguntaNormalizada.respostaCorreta
      );
      perguntaNormalizada.respostaCorreta = novoIndiceResposta;

      return perguntaNormalizada;
    });

    return quiz;
  }

  iniciarQuiz() {
    if (!this.quiz) {
      this.mostrarErro('❌ Dados do quiz inválidos');
      return;
    }

    console.log('✅ Quiz carregado com sucesso:', this.quiz.titulo);
    console.log(`📊 ${this.quiz.perguntas.length} perguntas encontradas`);

    // Resetar estado
    this.perguntaAtual = 0;
    this.respostas = [];
    this.feedbackMostrado = false;

    // Renderizar interface do quiz
    this.renderizarQuiz();
    this.mostrarPerguntaAtual();
  }

  renderizarQuiz() {
    const container = document.getElementById('quiz-container') || document.body;
    
    container.innerHTML = `
      <div class="quiz-layout">
        <button class="voltar-inicio-btn" onclick="quizManager.sairQuiz()">
          🏠 Voltar ao Dashboard
        </button>

        <div class="quiz-header">
          <div class="pergunta-numero">Pergunta ${this.perguntaAtual + 1} de ${this.quiz.perguntas.length}</div>
          <h1 class="quiz-titulo">${this.quiz.titulo}</h1>
          <div class="quiz-progresso">
            <div class="progresso-barra">
              <div class="progresso-preenchido" id="barra-progresso"></div>
            </div>
            <span class="progresso-texto" id="progresso-texto">${this.perguntaAtual + 1} de ${this.quiz.perguntas.length}</span>
          </div>
        </div>

        <div class="quiz-content">
          <div class="pergunta-container" id="pergunta-container">
            <!-- Pergunta será inserida aqui -->
          </div>

          <div class="quiz-controls">
            <button id="btn-anterior" class="btn btn-secondary" onclick="quizManager.perguntaAnterior()" disabled>
              ← Anterior
            </button>
            <button id="btn-proximo" class="btn btn-primary" onclick="quizManager.proximaPergunta()" disabled>
              Próxima →
            </button>
            <button id="btn-finalizar" class="btn btn-success" onclick="quizManager.finalizarQuiz()" style="display: none;">
              🏁 Finalizar Quiz
            </button>
          </div>
        </div>

        <div class="quiz-footer">
          <button class="btn-outline-danger" onclick="quizManager.sairQuiz()">
            🚪 Sair do Quiz
          </button>
        </div>
      </div>
    `;
  }

  mostrarPerguntaAtual() {
    const pergunta = this.quiz.perguntas[this.perguntaAtual];
    const container = document.getElementById('pergunta-container');

    if (!container || !pergunta) return;

    // Reset feedback
    this.feedbackMostrado = false;

    container.innerHTML = `
      <div class="pergunta-card">
        <h3 class="pergunta-titulo">${pergunta.pergunta}</h3>
        
        <div class="alternativas-container">
          ${pergunta.alternativas.map((alternativa, index) => `
            <div class="alternativa-item" onclick="quizManager.selecionarResposta(${index})" data-index="${index}">
              <input type="radio" name="resposta" value="${index}" style="display: none;"
                     ${this.respostas[this.perguntaAtual] === index ? 'checked' : ''}>
              <span class="alternativa-letra">${String.fromCharCode(65 + index)}</span>
              <span class="alternativa-texto">${alternativa}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Atualizar seleção se já existe
    if (this.respostas[this.perguntaAtual] !== undefined) {
      this.marcarAlternativaSelecionada(this.respostas[this.perguntaAtual]);
    }

    this.atualizarInterface();
  }

  selecionarResposta(index) {
    if (this.feedbackMostrado) return; // Impedir mudança após feedback

    // Limpar seleções anteriores
    document.querySelectorAll('.alternativa-item').forEach(item => {
      item.classList.remove('selected');
    });

    // Marcar nova seleção
    this.marcarAlternativaSelecionada(index);
    
    // Salvar resposta
    this.respostas[this.perguntaAtual] = index;

    // Mostrar feedback visual imediato
    this.mostrarFeedbackVisual(index);
    
    this.atualizarInterface();
  }

  marcarAlternativaSelecionada(index) {
    const alternativa = document.querySelector(`[data-index="${index}"]`);
    if (alternativa) {
      alternativa.classList.add('selected');
      const radio = alternativa.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    }
  }

  mostrarFeedbackVisual(respostaSelecionada) {
    const pergunta = this.quiz.perguntas[this.perguntaAtual];
    const respostaCorreta = pergunta.respostaCorreta;
    
    // Marcar feedback depois de um pequeno delay para o usuário ver a seleção
    setTimeout(() => {
      document.querySelectorAll('.alternativa-item').forEach((item, index) => {
        if (index === respostaCorreta) {
          item.classList.add('correct');
        } else if (index === respostaSelecionada && index !== respostaCorreta) {
          item.classList.add('wrong');
        }
      });
      
      this.feedbackMostrado = true;
      
      // Auto-avançar após feedback (opcional)
      if (this.perguntaAtual < this.quiz.perguntas.length - 1) {
        setTimeout(() => {
          this.proximaPergunta();
        }, 2000);
      }
    }, 500);
  }

  proximaPergunta() {
    if (this.perguntaAtual < this.quiz.perguntas.length - 1) {
      this.perguntaAtual++;
      this.mostrarPerguntaAtual();
    }
  }

  perguntaAnterior() {
    if (this.perguntaAtual > 0) {
      this.perguntaAtual--;
      this.mostrarPerguntaAtual();
    }
  }

  atualizarInterface() {
    // Atualizar barra de progresso
    const progresso = ((this.perguntaAtual + 1) / this.quiz.perguntas.length) * 100;
    const barraProgresso = document.getElementById('barra-progresso');
    const textoProgresso = document.getElementById('progresso-texto');
    
    if (barraProgresso) barraProgresso.style.width = `${progresso}%`;
    if (textoProgresso) textoProgresso.textContent = `${this.perguntaAtual + 1} de ${this.quiz.perguntas.length}`;

    // Atualizar número da pergunta no header
    const perguntaNumero = document.querySelector('.pergunta-numero');
    if (perguntaNumero) {
      perguntaNumero.textContent = `Pergunta ${this.perguntaAtual + 1} de ${this.quiz.perguntas.length}`;
    }

    // Atualizar botões
    const btnAnterior = document.getElementById('btn-anterior');
    const btnProximo = document.getElementById('btn-proximo');
    const btnFinalizar = document.getElementById('btn-finalizar');

    if (btnAnterior) btnAnterior.disabled = this.perguntaAtual === 0;
    
    const respostaAtualSelecionada = this.respostas[this.perguntaAtual] !== undefined;
    
    if (this.perguntaAtual === this.quiz.perguntas.length - 1) {
      // Última pergunta
      if (btnProximo) btnProximo.style.display = 'none';
      if (btnFinalizar) {
        btnFinalizar.style.display = 'inline-block';
        btnFinalizar.disabled = !respostaAtualSelecionada;
      }
    } else {
      // Pergunta intermediária
      if (btnProximo) {
        btnProximo.style.display = 'inline-block';
        btnProximo.disabled = !respostaAtualSelecionada;
      }
      if (btnFinalizar) btnFinalizar.style.display = 'none';
    }
  }

  finalizarQuiz() {
    // Verificar se todas as perguntas foram respondidas
    const perguntasNaoRespondidas = [];
    for (let i = 0; i < this.quiz.perguntas.length; i++) {
      if (this.respostas[i] === undefined) {
        perguntasNaoRespondidas.push(i + 1);
      }
    }

    if (perguntasNaoRespondidas.length > 0) {
      const confirmar = confirm(
        `Você não respondeu ${perguntasNaoRespondidas.length} pergunta(s): ${perguntasNaoRespondidas.join(', ')}.\n\nDeseja finalizar mesmo assim?`
      );
      if (!confirmar) return;
    }

    this.calcularResultado();
  }

  calcularResultado() {
    let acertos = 0;
    let detalhes = [];

    this.quiz.perguntas.forEach((pergunta, index) => {
      const respostaUsuario = this.respostas[index];
      const respostaCorreta = pergunta.respostaCorreta;
      const acertou = respostaUsuario === respostaCorreta;

      if (acertou) acertos++;

      detalhes.push({
        pergunta: pergunta.pergunta,
        respostaUsuario: respostaUsuario !== undefined ? pergunta.alternativas[respostaUsuario] : 'Não respondida',
        respostaCorreta: pergunta.alternativas[respostaCorreta],
        acertou,
        explicacao: pergunta.explicacao || ''
      });
    });

    const porcentagem = Math.round((acertos / this.quiz.perguntas.length) * 100);

    this.mostrarResultado(acertos, this.quiz.perguntas.length, porcentagem, detalhes);
  }

  mostrarResultado(acertos, total, porcentagem, detalhes) {
    const container = document.getElementById('quiz-container') || document.body;

    let nivelDesempenho = '';
    let emoji = '';
    if (porcentagem >= 80) {
      nivelDesempenho = 'Excelente!';
      emoji = '🏆';
    } else if (porcentagem >= 60) {
      nivelDesempenho = 'Bom trabalho!';
      emoji = '👍';
    } else {
      nivelDesempenho = 'Continue estudando!';
      emoji = '📚';
    }

    // Layout conforme Imagem 1 - Fundo azul com resultado centralizado
    container.innerHTML = `
      <div class="resultado-quiz-overlay">
        <div class="resultado-quiz-container">
          <div class="resultado-header">
            <h1 class="resultado-titulo">Quiz: ${this.quiz.titulo}</h1>
            <div class="resultado-status">${emoji}</div>
            <h2 class="resultado-nivel">${nivelDesempenho}</h2>
            <p class="resultado-descricao">Você acertou ${acertos} de ${total} perguntas</p>
            <div class="resultado-porcentagem">(${porcentagem}% de acerto)</div>
          </div>

          <div class="resultado-acoes">
            <button class="btn-resultado btn-jogar-novamente" onclick="quizManager.refazerQuiz()">
              🔄 Jogar Novamente
            </button>
            <button class="btn-resultado btn-voltar-inicio" onclick="quizManager.voltarDashboard()">
              🏠 Voltar ao Início
            </button>
          </div>

          <div class="resultado-detalhes-toggle">
            <button class="btn-detalhes" onclick="quizManager.toggleDetalhes()">
              📊 Ver Detalhes das Respostas
            </button>
          </div>
        </div>

        <div class="resultado-detalhes-container" id="detalhes-container" style="display: none;">
          <div class="detalhes-content">
            <h3>📊 Análise Detalhada:</h3>
            ${detalhes.map((detalhe, index) => `
              <div class="pergunta-resultado ${detalhe.acertou ? 'acerto' : 'erro'}">
                <h4>Pergunta ${index + 1}: ${detalhe.acertou ? '✅' : '❌'}</h4>
                <p class="pergunta-texto">${detalhe.pergunta}</p>
                <p><strong>Sua resposta:</strong> ${detalhe.respostaUsuario}</p>
                <p><strong>Resposta correta:</strong> ${detalhe.respostaCorreta}</p>
                ${detalhe.explicacao ? `<p class="explicacao"><strong>💡 Explicação:</strong> ${detalhe.explicacao}</p>` : ''}
              </div>
            `).join('')}
            <button class="btn-fechar-detalhes" onclick="quizManager.toggleDetalhes()">
              ✖ Fechar Detalhes
            </button>
          </div>
        </div>
      </div>
    `;

    // Adicionar estilos CSS específicos do resultado
    this.adicionarEstilosResultado();

    // Salvar resultado no backend
    this.salvarResultado(acertos, total, porcentagem);
  }

  adicionarEstilosResultado() {
    // Verificar se estilos já foram adicionados
    if (document.getElementById('estilos-resultado')) return;

    const style = document.createElement('style');
    style.id = 'estilos-resultado';
    style.textContent = `
      .resultado-quiz-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
        box-sizing: border-box;
      }

      .resultado-quiz-container {
        background: rgba(0, 170, 255, 0.15);
        border: 3px solid #0af;
        border-radius: 20px;
        padding: 40px;
        text-align: center;
        max-width: 600px;
        width: 100%;
        box-shadow: 0 0 50px rgba(0, 170, 255, 0.4);
        backdrop-filter: blur(10px);
        animation: fadeInScale 0.6s ease-out;
      }

      @keyframes fadeInScale {
        from {
          opacity: 0;
          transform: scale(0.8);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .resultado-titulo {
        color: #fff;
        font-size: 2rem;
        margin-bottom: 20px;
        text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
      }

      .resultado-status {
        font-size: 4rem;
        margin: 20px 0;
        animation: bounce 2s infinite;
      }

      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% {
          transform: translateY(0);
        }
        40% {
          transform: translateY(-10px);
        }
        60% {
          transform: translateY(-5px);
        }
      }

      .resultado-nivel {
        color: #0af;
        font-size: 2.5rem;
        margin: 15px 0;
        text-shadow: 0 0 20px #0af;
      }

      .resultado-descricao {
        color: #fff;
        font-size: 1.3rem;
        margin: 15px 0;
      }

      .resultado-porcentagem {
        color: #0af;
        font-size: 1.5rem;
        font-weight: bold;
        margin: 10px 0 30px 0;
      }

      .resultado-acoes {
        display: flex;
        gap: 20px;
        justify-content: center;
        margin: 30px 0;
        flex-wrap: wrap;
      }

      .btn-resultado {
        background: linear-gradient(45deg, #0af, #08c);
        border: none;
        border-radius: 12px;
        padding: 15px 25px;
        color: #000;
        font-weight: bold;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 5px 20px rgba(0, 170, 255, 0.3);
        min-width: 180px;
      }

      .btn-resultado:hover {
        background: linear-gradient(45deg, #08c, #0af);
        color: #fff;
        transform: translateY(-3px);
        box-shadow: 0 8px 30px rgba(0, 170, 255, 0.6);
      }

      .btn-voltar-inicio {
        background: linear-gradient(45deg, #666, #888) !important;
      }

      .btn-voltar-inicio:hover {
        background: linear-gradient(45deg, #888, #aaa) !important;
      }

      .resultado-detalhes-toggle {
        margin-top: 20px;
      }

      .btn-detalhes {
        background: transparent;
        border: 2px solid #0af;
        color: #0af;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.3s ease;
      }

      .btn-detalhes:hover {
        background: #0af;
        color: #000;
      }

      .resultado-detalhes-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 10001;
        overflow-y: auto;
        padding: 20px;
        box-sizing: border-box;
      }

      .detalhes-content {
        max-width: 800px;
        margin: 0 auto;
        background: rgba(17, 17, 17, 0.95);
        border-radius: 15px;
        padding: 30px;
        border: 2px solid #0af;
      }

      .detalhes-content h3 {
        color: #0af;
        text-align: center;
        margin-bottom: 30px;
        font-size: 1.8rem;
      }

      .pergunta-resultado {
        background: rgba(0, 170, 255, 0.1);
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
        border-left: 5px solid;
      }

      .pergunta-resultado.acerto {
        border-left-color: #22c55e;
        background: rgba(34, 197, 94, 0.1);
      }

      .pergunta-resultado.erro {
        border-left-color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }

      .pergunta-resultado h4 {
        color: #0af;
        margin-bottom: 15px;
        font-size: 1.2rem;
      }

      .pergunta-texto {
        color: #fff;
        font-weight: bold;
        margin-bottom: 10px;
      }

      .pergunta-resultado p {
        color: #ccc;
        margin: 8px 0;
        line-height: 1.5;
      }

      .explicacao {
        background: rgba(0, 170, 255, 0.15);
        padding: 15px;
        border-radius: 8px;
        margin-top: 15px;
        border-left: 3px solid #0af;
      }

      .btn-fechar-detalhes {
        background: #ff4444;
        color: #fff;
        border: none;
        padding: 12px 25px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
        margin: 20px auto;
        display: block;
        transition: all 0.3s ease;
      }

      .btn-fechar-detalhes:hover {
        background: #cc0000;
        transform: translateY(-2px);
      }

      @media (max-width: 768px) {
        .resultado-quiz-container {
          padding: 20px;
          margin: 10px;
        }

        .resultado-titulo {
          font-size: 1.5rem;
        }

        .resultado-nivel {
          font-size: 2rem;
        }

        .resultado-acoes {
          flex-direction: column;
          align-items: center;
        }

        .btn-resultado {
          width: 100%;
          max-width: 250px;
        }
      }
    `;
    document.head.appendChild(style);
  }
